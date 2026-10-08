import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { z } from "zod";

import { JobError } from "@/domains/taches/kinds";
import { emit, enqueue } from "@/domains/taches/queue";
import type { JobHandler } from "@/domains/taches/worker";
import {
  auditEvents,
  availabilityWindows,
  consents,
  followupContacts,
  followupStatusEvents,
  followupSteps,
  followups,
  messages,
  scheduledJobs,
} from "@/server/db/schema";
import type { TenantTransaction } from "@/server/db/tenant";

import type { SendWindow } from "./envoi";
import { automaticEndAt, stepsToSchedule } from "./programme";

/**
 * Rappels planifiés et fin du suivi automatisé (cahier des charges §5, ADR 0018).
 * - Les étapes de la fiche partent par la file (`followup.reminder`), une tâche par étape, à
 *   clé fixe : planifier deux fois ne crée jamais de doublon. Elles ne sont planifiées
 *   qu'avec l'accord du propriétaire et un suivi actif.
 * - Modifier la fiche remplace les rappels à venir (les étapes remplacées perdent leur tâche
 *   en attente) ; un rappel parti, ou dont l'heure est passée, ne change jamais.
 * - `followup.end` arrête le suivi automatisé à la date de contrôle ; la conversation reste
 *   ouverte (ADR 0016) et Numa répond si le propriétaire réécrit.
 */

export const REMINDER_KIND = "followup.reminder";
export const END_KIND = "followup.end";
/** Motif de l'historique des statuts pour une fin automatique. */
export const AUTOMATIC_END_REASON = "control_date_reached";

/** Plage d'envoi des messages programmés du cabinet (heure de Paris). */
export async function messageWindows(
  tx: TenantTransaction,
): Promise<SendWindow[]> {
  const rows = await tx
    .select({
      weekday: availabilityWindows.weekday,
      startsAt: availabilityWindows.startsAt,
      endsAt: availabilityWindows.endsAt,
    })
    .from(availabilityWindows)
    .where(eq(availabilityWindows.kind, "messages"));
  return rows.map((row) => ({
    weekday: row.weekday,
    startsAt: row.startsAt.slice(0, 5),
    endsAt: row.endsAt.slice(0, 5),
  }));
}

async function loadSchedule(tx: TenantTransaction, followupId: string) {
  const [followup] = await tx
    .select({
      id: followups.id,
      organizationId: followups.organizationId,
      status: followups.status,
      isTest: followups.isTest,
      procedureAt: followups.procedureAt,
      controlAppointmentAt: followups.controlAppointmentAt,
    })
    .from(followups)
    .where(eq(followups.id, followupId));
  if (!followup) return null;
  const steps = await tx
    .select({ id: followupSteps.id, offsetHours: followupSteps.offsetHours })
    .from(followupSteps)
    .where(
      and(
        eq(followupSteps.followupId, followupId),
        isNull(followupSteps.supersededAt),
      ),
    );
  const endAt = automaticEndAt({
    procedureAt: followup.procedureAt,
    controlAppointmentAt: followup.controlAppointmentAt,
    stepOffsets: steps.map((step) => step.offsetHours),
  });
  return { followup, steps, endAt };
}

/** Accord en cours du contact principal. */
async function primaryConsent(tx: TenantTransaction, followupId: string) {
  const [row] = await tx
    .select({ state: consents.state })
    .from(consents)
    .innerJoin(
      followupContacts,
      eq(followupContacts.id, consents.followupContactId),
    )
    .where(
      and(
        eq(consents.followupId, followupId),
        eq(followupContacts.role, "primary"),
      ),
    )
    .orderBy(desc(consents.recordedAt))
    .limit(1);
  return row?.state ?? null;
}

async function cancelPending(
  tx: TenantTransaction,
  followupId: string,
  kind: string,
  now: Date,
  keepStepIds?: readonly string[],
) {
  await tx
    .update(scheduledJobs)
    .set({ status: "cancelled", finishedAt: now })
    .where(
      and(
        eq(scheduledJobs.followupId, followupId),
        eq(scheduledJobs.kind, kind),
        eq(scheduledJobs.status, "pending"),
        keepStepIds?.length
          ? notInArray(sql`${scheduledJobs.payload}->>'stepId'`, [
              ...keepStepIds,
            ])
          : undefined,
      ),
    );
}

/**
 * (Re)planifie les rappels d'un suivi : après l'accord, une modification de la fiche, une
 * reprise. Les tâches des étapes remplacées sont annulées ; chaque étape à venir reçoit sa
 * tâche, une seule fois. Renvoie le nombre d'étapes planifiées par cet appel ou avant.
 */
export async function scheduleReminders(
  tx: TenantTransaction,
  followupId: string,
  now: Date,
): Promise<number> {
  const loaded = await loadSchedule(tx, followupId);
  if (!loaded) return 0;
  const { followup, steps, endAt } = loaded;
  // Les tâches des étapes qui ne sont plus dans la fiche ne partiront pas.
  await cancelPending(
    tx,
    followupId,
    REMINDER_KIND,
    now,
    steps.map((step) => step.id),
  );
  if (followup.status !== "active" || followup.isTest) return 0;
  if ((await primaryConsent(tx, followupId)) !== "given") return 0;
  const planned = stepsToSchedule({
    steps,
    procedureAt: followup.procedureAt,
    endAt,
    windows: await messageWindows(tx),
    now,
  });
  for (const { step, runAt } of planned)
    await enqueue(tx, {
      organizationId: followup.organizationId,
      kind: REMINDER_KIND,
      idempotencyKey: `followup:${followupId}:step:${step.id}`,
      runAt,
      followupId,
      payload: { stepId: step.id },
    });
  return planned.length;
}

/**
 * Planifie la fin du suivi automatisé à la date de contrôle (ou un jour après la dernière
 * étape). Une fin déjà prévue est remplacée : la tâche porte l'heure qu'elle applique.
 */
export async function scheduleAutomaticEnd(
  tx: TenantTransaction,
  followupId: string,
  now: Date,
) {
  const loaded = await loadSchedule(tx, followupId);
  if (!loaded) return;
  const { followup, endAt } = loaded;
  await cancelPending(tx, followupId, END_KIND, now);
  if (followup.status === "draft" || followup.status === "ended") return;
  // Date déjà passée (suivi réactivé après sa fin) : le vétérinaire l'arrêtera lui-même,
  // ou fixera un nouveau contrôle dans la fiche.
  if (endAt.getTime() <= now.getTime()) return;
  await enqueue(tx, {
    organizationId: followup.organizationId,
    kind: END_KIND,
    idempotencyKey: `followup:${followupId}:end:${randomUUID()}`,
    runAt: endAt,
    followupId,
    // Heure appliquée, en millisecondes : la tâche se sait périmée si le contrôle change.
    payload: { endAt: String(endAt.getTime()) },
  });
}

/** Motif du dernier changement de statut (ex. `control_date_reached`), sans texte libre. */
export async function lastStatusReason(
  tx: TenantTransaction,
  followupId: string,
): Promise<string | null> {
  const [row] = await tx
    .select({ reason: followupStatusEvents.reason })
    .from(followupStatusEvents)
    .where(eq(followupStatusEvents.followupId, followupId))
    .orderBy(desc(followupStatusEvents.occurredAt))
    .limit(1);
  return row?.reason ?? null;
}

const endPayload = z.object({ endAt: z.string().regex(/^\d{1,16}$/) });

/** Tâche `followup.end` : arrêt du suivi automatisé, message de clôture, conversation ouverte. */
export function followupEndHandlers(): Record<string, JobHandler> {
  const handler: JobHandler = async ({ tx, job }) => {
    const parsed = endPayload.safeParse(job.payload);
    if (!parsed.success) throw new JobError("invalid_payload");
    if (!job.followupId) throw new JobError("target_missing");
    await tx
      .select({ id: followups.id })
      .from(followups)
      .where(eq(followups.id, job.followupId))
      .for("update");
    const loaded = await loadSchedule(tx, job.followupId);
    if (!loaded) throw new JobError("target_missing");
    const { followup, endAt } = loaded;
    if (followup.status === "draft" || followup.status === "ended") return;
    // Date de contrôle changée depuis la planification : la nouvelle tâche s'en charge.
    if (Number(parsed.data.endAt) !== endAt.getTime()) return;

    const now = new Date();
    await tx.execute(
      sql`SELECT set_config('app.status_reason', ${AUTOMATIC_END_REASON}, true)`,
    );
    await tx
      .update(followups)
      .set({ status: "ended", endedAt: now })
      .where(eq(followups.id, followup.id));
    await cancelPending(tx, followup.id, REMINDER_KIND, now);
    if (!followup.isTest)
      await enqueue(tx, {
        organizationId: followup.organizationId,
        kind: "followup.message",
        idempotencyKey: `followup:${followup.id}:closing:${job.id}`,
        runAt: now,
        followupId: followup.id,
        payload: { step: "closing", token: job.id },
      });
    await tx.insert(auditEvents).values({
      organizationId: followup.organizationId,
      actorMembershipId: null,
      action: "followup.ended_automatically",
      targetType: "followup",
      targetId: followup.id,
      metadata: { from: followup.status },
    });
    await emit(tx, {
      organizationId: followup.organizationId,
      topic: "followup.ended",
      aggregateType: "followup",
      aggregateId: followup.id,
    });
  };
  return { [END_KIND]: handler };
}

/** Rappels d'une liste d'étapes : tâche la plus récente de chacune (affichage du programme). */
export async function reminderJobs(
  tx: TenantTransaction,
  followupId: string,
  stepIds: readonly string[],
) {
  if (!stepIds.length) return [];
  return tx
    .select({
      stepId: sql<string>`${scheduledJobs.payload}->>'stepId'`,
      status: scheduledJobs.status,
      runAt: scheduledJobs.runAt,
    })
    .from(scheduledJobs)
    .where(
      and(
        eq(scheduledJobs.followupId, followupId),
        eq(scheduledJobs.kind, REMINDER_KIND),
        inArray(sql`${scheduledJobs.payload}->>'stepId'`, [...stepIds]),
      ),
    );
}

export type ProgrammeStepState =
  | "sent"
  | "sending"
  | "failed"
  | "scheduled"
  | "waiting_consent"
  | "on_hold"
  | "not_sent"
  | "after_end";

export type ProgrammeView = {
  steps: {
    id: string;
    kind: "message" | "question" | "photo_request" | "reminder" | "control";
    content: string;
    dueAt: Date;
    state: ProgrammeStepState;
    /** Heure d'envoi (fait ou prévu), selon l'état. */
    at: Date | null;
  }[];
  /** Fin du suivi automatisé prévue, ou null si aucune n'est planifiée. */
  plannedEndAt: Date | null;
  endsAtControl: boolean;
  /** Suivi terminé : à la date de contrôle ou arrêté par le vétérinaire. */
  ended: { at: Date | null; automatic: boolean } | null;
};

/**
 * Programme d'un suivi pour le dossier : chaque étape de la fiche avec son état d'envoi, et la
 * fin du suivi automatisé. L'appelant a vérifié l'accès clinique au dossier.
 */
export async function programmeOf(
  tx: TenantTransaction,
  followupId: string,
  now = new Date(),
): Promise<ProgrammeView> {
  const loaded = await loadSchedule(tx, followupId);
  if (!loaded) throw new Error("Suivi introuvable");
  const { followup, endAt } = loaded;
  const steps = await tx
    .select({
      id: followupSteps.id,
      kind: followupSteps.kind,
      content: followupSteps.content,
      offsetHours: followupSteps.offsetHours,
    })
    .from(followupSteps)
    .where(
      and(
        eq(followupSteps.followupId, followupId),
        isNull(followupSteps.supersededAt),
      ),
    );
  const ids = steps.map((step) => step.id);
  const jobs = await reminderJobs(tx, followupId, ids);
  const sentRows = ids.length
    ? await tx
        .select({
          key: messages.idempotencyKey,
          status: messages.deliveryStatus,
          sentAt: messages.sentAt,
          occurredAt: messages.occurredAt,
        })
        .from(messages)
        .where(
          and(
            eq(messages.followupId, followupId),
            inArray(
              messages.idempotencyKey,
              ids.map((id) => `step:${id}`),
            ),
          ),
        )
    : [];
  const consent = await primaryConsent(tx, followupId);
  const [end] = await tx
    .select({ runAt: scheduledJobs.runAt })
    .from(scheduledJobs)
    .where(
      and(
        eq(scheduledJobs.followupId, followupId),
        eq(scheduledJobs.kind, END_KIND),
        eq(scheduledJobs.status, "pending"),
      ),
    )
    .limit(1);
  const reason =
    followup.status === "ended" ? await lastStatusReason(tx, followupId) : null;
  const [row] = await tx
    .select({ endedAt: followups.endedAt })
    .from(followups)
    .where(eq(followups.id, followupId));

  return {
    steps: steps
      .map((step) => {
        const dueAt = new Date(
          followup.procedureAt.getTime() + step.offsetHours * 3_600_000,
        );
        const message = sentRows.find(
          (entry) => entry.key === `step:${step.id}`,
        );
        const job = jobs.find((entry) => entry.stepId === step.id);
        let state: ProgrammeStepState;
        let at: Date | null = null;
        if (
          message?.status === "sent" ||
          message?.status === "delivered" ||
          message?.status === "read"
        ) {
          state = "sent";
          at = message.sentAt ?? message.occurredAt;
        } else if (message?.status === "failed") state = "failed";
        else if (message) state = "sending";
        else if (job?.status === "pending" || job?.status === "running") {
          state = "scheduled";
          at = job.runAt;
        } else if (dueAt.getTime() >= endAt.getTime()) state = "after_end";
        else if (
          job ||
          dueAt.getTime() <= now.getTime() ||
          followup.status === "ended"
        )
          state = "not_sent";
        else if (consent !== "given") state = "waiting_consent";
        else state = "on_hold";
        return {
          id: step.id,
          kind: step.kind,
          content: step.content,
          dueAt,
          state,
          at,
        };
      })
      .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime()),
    plannedEndAt: end?.runAt ?? null,
    endsAtControl: followup.controlAppointmentAt !== null,
    ended:
      followup.status === "ended"
        ? {
            at: row?.endedAt ?? null,
            automatic: reason === AUTOMATIC_END_REASON,
          }
        : null,
  };
}
