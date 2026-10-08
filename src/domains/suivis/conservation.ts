import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { ObjectStorage } from "@/adapters/object-storage";
import { JobError } from "@/domains/taches/kinds";
import { enqueue } from "@/domains/taches/queue";
import type { JobHandler } from "@/domains/taches/worker";
import { attachments, auditEvents, followups } from "@/server/db/schema";
import type { Database } from "@/server/db/tenant";

/**
 * Conservation des données (cahier des charges §15, architecture §12, ADR 0020).
 * Chaque jour, une tâche par cabinet (`retention.sweep`) repère les suivis arrivés à
 * échéance : un an après leur fin, ou quinze mois après leur création s'ils n'ont jamais été
 * terminés. Chacun est ensuite effacé par sa propre tâche (`followup.purge`) : fichiers du
 * stockage objet d'abord, puis la base par `app.purge_followup`, qui revérifie l'échéance
 * avec son horloge et ne garde que des statistiques anonymisées.
 * La tâche d'effacement ne porte pas le suivi en colonne (elle serait effacée avec lui) :
 * seulement son identifiant dans la charge utile.
 */

export const SWEEP_KIND = "retention.sweep";
export const FOLLOWUP_PURGE_KIND = "followup.purge";

/** Suivis traités par balayage ; le suivant reprend le reste. */
const SWEEP_BATCH = 200;

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
        sql`app.followup_purge_due(${followups.endedAt}, ${followups.createdAt})`,
      )
      .limit(SWEEP_BATCH);
    for (const { id } of due)
      await enqueue(tx, {
        organizationId: job.organizationId,
        kind: FOLLOWUP_PURGE_KIND,
        idempotencyKey: `followup:${id}:purge`,
        runAt: new Date(),
        followupId: null,
        payload: { followupId: id },
      });
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
    await tx.insert(auditEvents).values({
      organizationId: job.organizationId,
      actorMembershipId: null,
      action: "followup.purged",
      targetType: "followup",
      targetId: followupId,
      metadata: { files: files.length },
    });
  };

  return { [SWEEP_KIND]: sweep, [FOLLOWUP_PURGE_KIND]: purge };
}
