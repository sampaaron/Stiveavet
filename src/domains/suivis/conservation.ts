import { and, eq, isNull, sql } from "drizzle-orm";
import { recordAudit } from "@/domains/audit/journal";
import { z } from "zod";

import type { ObjectStorage } from "@/adapters/object-storage";
import { JobError } from "@/domains/taches/kinds";
import { enqueue } from "@/domains/taches/queue";
import type { JobHandler } from "@/domains/taches/worker";
import { animals, attachments, followups } from "@/server/db/schema";
import type { Database } from "@/server/db/tenant";

/**
 * Conservation des données (cahier des charges §15, architecture §12, ADR 0020).
 * Chaque jour, une tâche par cabinet (`retention.sweep`) repère les suivis arrivés à
 * échéance : un an après leur fin, ou quinze mois après leur création s'ils n'ont jamais été
 * terminés. Chacun est ensuite effacé par sa propre tâche (`followup.purge`) : fichiers du
 * stockage objet d'abord, puis la base par `app.purge_followup`, qui revérifie l'échéance
 * avec son horloge et ne garde que des statistiques anonymisées.
 * La tâche d'effacement ne porte pas le suivi en colonne (elle serait effacée avec lui) :
 * seulement son identifiant dans la charge utile. Sa clé dépend du balayage : un effacement
 * resté en échec est retenté par le balayage du lendemain (ADR 0038).
 * Le même balayage efface les échanges avec Stive de plus de 30 jours (ADR 0034), les
 * rendez-vous hors suivi finis depuis un an puis les animaux qui ne servent plus, et les
 * traces techniques de plus de 90 jours (ADR 0038).
 */

export const SWEEP_KIND = "retention.sweep";
const FOLLOWUP_PURGE_KIND = "followup.purge";

/** Suivis traités par balayage ; le suivant reprend le reste. */
const SWEEP_BATCH = 200;
const IDLE_ANIMAL_RETENTION = "15 months";

const purgePayload = z.object({ followupId: z.uuid() });

/** Premier passage du jour : une tâche de balayage par cabinet (heure de Paris). */
export async function planRetentionSweeps(db: Database): Promise<number> {
  const result = await db.execute<{ planned: number }>(
    sql`SELECT jobs.plan_retention_sweeps() AS planned`,
  );
  return Number(result.rows[0]?.planned ?? 0);
}

export function retentionHandlers(deps: {
  storage: ObjectStorage;
}): Record<string, JobHandler> {
  const { storage } = deps;

  const sweep: JobHandler = async ({ tx, job }) => {
    const due = await tx
      .select({ id: followups.id })
      .from(followups)
      .where(
        and(
          sql`app.followup_purge_due(${followups.endedAt}, ${followups.createdAt})`,
          // Un effacement encore en cours ou programmé n'est pas doublé.
          sql`NOT EXISTS (SELECT 1 FROM scheduled_jobs j WHERE j.kind = ${FOLLOWUP_PURGE_KIND}
            AND j.status IN ('pending', 'running') AND j.payload ->> 'followupId' = ${followups.id}::text)`,
        ),
      )
      .limit(SWEEP_BATCH);
    for (const { id } of due)
      await enqueue(tx, {
        organizationId: job.organizationId,
        kind: FOLLOWUP_PURGE_KIND,
        idempotencyKey: `followup:${id}:purge:${job.id}`,
        runAt: new Date(),
        followupId: null,
        payload: { followupId: id },
      });
    // Rendez-vous hors suivi finis depuis un an (migration 0026) : sans eux, l'animal resterait.
    await tx.execute(sql`SELECT app.purge_past_appointments()`);
    // Animaux du registre restés sans suivi (migration 0021) : effacés quinze mois après leur
    // saisie, comme un suivi jamais terminé. La fonction revérifie tout avec son horloge.
    const idle = await tx
      .select({ id: animals.id })
      .from(animals)
      .where(
        and(
          sql`${animals.createdAt} <= now() - ${IDLE_ANIMAL_RETENTION}::interval`,
          sql`NOT EXISTS (SELECT 1 FROM followups f WHERE f.animal_id = ${animals.id})`,
        ),
      )
      .limit(SWEEP_BATCH);
    // Tâches, événements, webhooks et notifications de plus de 90 jours (migration 0026).
    await tx.execute(sql`SELECT app.purge_technical_records()`);
    // Échanges avec Stive : effacés 30 jours après leur création (migration 0024).
    const stive = await tx.execute<{ removed: number }>(
      sql`SELECT app.purge_stive_messages() AS removed`,
    );
    const removed = Number(stive.rows[0]?.removed ?? 0);
    if (removed > 0)
      await recordAudit(
        tx,
        { organizationId: job.organizationId, membershipId: null },
        "stive.messages_purged",
        { type: "organization", id: job.organizationId },
        { messages: removed },
      );
    for (const { id } of idle) {
      const result = await tx.execute<{ deleted: boolean }>(
        sql`SELECT app.delete_unused_animal(${id}, ${IDLE_ANIMAL_RETENTION}::interval) AS deleted`,
      );
      if (result.rows[0]?.deleted)
        await recordAudit(
          tx,
          { organizationId: job.organizationId, membershipId: null },
          "animal.purged",
          { type: "animal", id },
        );
    }
  };

  const purge: JobHandler = async ({ tx, job }) => {
    const parsed = purgePayload.safeParse(job.payload);
    if (!parsed.success) throw new JobError("invalid_payload");
    const { followupId } = parsed.data;
    const [due] = await tx
      .select({ id: followups.id })
      .from(followups)
      .where(
        and(
          eq(followups.id, followupId),
          sql`app.followup_purge_due(${followups.endedAt}, ${followups.createdAt})`,
        ),
      );
    // Déjà effacé, ou réactivé entre-temps : rien à faire.
    if (!due) return;

    const files = await tx
      .select({ key: attachments.storageKey })
      .from(attachments)
      .where(
        and(
          eq(attachments.followupId, followupId),
          isNull(attachments.deletedAt),
        ),
      );
    // Fichiers d'abord : si la suite échoue, la tâche recommence (suppression idempotente).
    try {
      for (const file of files) await storage.deleteObject(file.key);
    } catch {
      throw new JobError("provider_unavailable");
    }

    const result = await tx.execute<{ purged: boolean }>(
      sql`SELECT app.purge_followup(${followupId}) AS purged`,
    );
    if (!result.rows[0]?.purged) return;
    await recordAudit(
      tx,
      { organizationId: job.organizationId, membershipId: null },
      "followup.purged",
      { type: "followup", id: followupId },
      { files: files.length },
    );
  };

  return { [SWEEP_KIND]: sweep, [FOLLOWUP_PURGE_KIND]: purge };
}
