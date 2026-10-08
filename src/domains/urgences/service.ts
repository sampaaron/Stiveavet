import { randomUUID } from "node:crypto";

import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";

import type { WhatsAppConnector } from "@/adapters/whatsapp/types";
import type { AuditMetadata } from "@/domains/audit/schema";
import { DomainError, assertPermission } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import { VET_ROLES } from "@/domains/equipe/permissions";
import { DEFAULT_INSTRUCTIONS } from "@/domains/reglages/content";
import type { EmergencyPeriod } from "@/domains/reglages/content";
import { loadFollowup } from "@/domains/suivis/lancement";
import { followupAccess } from "@/domains/suivis/policies";
import { messageWindows } from "@/domains/suivis/rappels";
import { JobError } from "@/domains/taches/kinds";
import { enqueue } from "@/domains/taches/queue";
import type { JobHandler } from "@/domains/taches/worker";
import {
  acknowledgements,
  alerts,
  animals,
  auditEvents,
  emergencyContacts,
  emergencyInstructions,
  followupAlertRules,
  followupShares,
  followups,
  memberships,
  notificationDeliveries,
  onCallSchedules,
  organizationSettings,
  scheduledJobs,
  triageEvents,
  users,
} from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import type { Database, TenantTransaction } from "@/server/db/tenant";

import { triageReason, triageReasonColumns, triageRuleJoin } from "./reason";
import type { TriageReason } from "./reason";
import {
  assessOwnerMessage,
  emergencyPeriod,
  escalationTime,
  firstRecipient,
  higherLevel,
} from "./triage";
import type { TriageLevel } from "./triage";

/**
 * Triage, alertes et garde (cahier des charges §7, ADR 0017).
 * - Chaque message du propriétaire est évalué par des règles déterministes, dans la
 *   transaction qui l'enregistre : l'alerte existe dès que le message est reçu.
 * - « À surveiller » : notification sur l'ordinateur du vétérinaire prévenu en premier.
 *   « Urgent » : alerte WhatsApp (simulée) immédiate, puis escalade aux autres vétérinaires
 *   à l'heure réglée (3 à 5 h) sans accusé de réception, jamais avant.
 * - Les consignes d'urgence partent au propriétaire tout de suite, sans attendre l'escalade.
 * Le journal et les tâches ne portent que des identifiants et des codes.
 */

type AlertLevel = "watch" | "urgent";
type AlertStatus = "open" | "acknowledged" | "escalated" | "resolved";

export type AlertView = {
  id: string;
  followupId: string;
  animalName: string;
  level: AlertLevel;
  status: AlertStatus;
  /** Contenu clinique : réservé à l'accès clinique. */
  reason: TriageReason;
  targetName: string;
  createdAt: Date;
  escalateAt: Date | null;
  escalatedAt: Date | null;
  acknowledgedBy: string | null;
  acknowledgedAt: Date | null;
  canAcknowledge: boolean;
};

const uuid = z.uuid();
const alertPayload = z.object({ alertId: z.uuid() });

/** Vétérinaire prévenu en premier : responsable aux heures du cabinet, sinon la garde. */
async function recipientFor(
  tx: TenantTransaction,
  responsibleMembershipId: string,
  period: EmergencyPeriod,
  now: Date,
): Promise<string> {
  const [responsible] = await tx
    .select({ id: memberships.id, deactivatedAt: memberships.deactivatedAt })
    .from(memberships)
    .where(eq(memberships.id, responsibleMembershipId));
  const [onCall] = await tx
    .select({ membershipId: onCallSchedules.membershipId })
    .from(onCallSchedules)
    .innerJoin(memberships, eq(memberships.id, onCallSchedules.membershipId))
    .where(
      and(
        lte(onCallSchedules.startsAt, now),
        gt(onCallSchedules.endsAt, now),
        isNull(memberships.deactivatedAt),
      ),
    )
    .orderBy(asc(onCallSchedules.startsAt))
    .limit(1);
  const [admin] = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(eq(memberships.role, "admin_vet"), isNull(memberships.deactivatedAt)),
    )
    .orderBy(asc(memberships.createdAt))
    .limit(1);
  const target = firstRecipient({
    period,
    responsible: {
      membershipId: responsibleMembershipId,
      active: Boolean(responsible && !responsible.deactivatedAt),
    },
    onCallMembershipId: onCall?.membershipId ?? null,
    fallbackAdminMembershipId: admin?.id ?? null,
  });
  // Un cabinet a toujours un vétérinaire administrateur actif (règle de l'équipe).
  if (!target) throw new Error("Aucun vétérinaire à prévenir");
  return target;
}

/** Recalcule la priorité du suivi d'après ses alertes non closes. */
async function refreshFollowupTriage(
  tx: TenantTransaction,
  followupId: string,
) {
  const open = await tx
    .select({ level: alerts.level })
    .from(alerts)
    .where(
      and(eq(alerts.followupId, followupId), ne(alerts.status, "resolved")),
    );
  const level = open.reduce<TriageLevel>(
    (current, row) => higherLevel(current, row.level),
    "normal",
  );
  await tx
    .update(followups)
    .set({ triage: level })
    .where(eq(followups.id, followupId));
}

export type TriageResult = {
  level: TriageLevel;
  alertId: string | null;
};

/**
 * Évalue un message du propriétaire, dans la transaction qui l'enregistre. Crée l'alerte
 * et planifie la notification (et l'escalade d'une urgence) ; ne contacte personne ici.
 */
export async function triageOwnerMessage(
  tx: TenantTransaction,
  input: {
    organizationId: string;
    followupId: string;
    responsibleMembershipId: string;
    messageId: string;
    body: string;
    /** Message reçu après la fin du suivi automatisé (lot 15) : le vétérinaire est informé. */
    afterAutomaticEnd?: boolean;
  },
  now = new Date(),
): Promise<TriageResult> {
  const rules = await tx
    .select({
      id: followupAlertRules.id,
      level: followupAlertRules.level,
      description: followupAlertRules.description,
    })
    .from(followupAlertRules)
    .where(
      and(
        eq(followupAlertRules.followupId, input.followupId),
        isNull(followupAlertRules.supersededAt),
      ),
    );
  let assessment = assessOwnerMessage(input.body, rules);
  if (assessment.level === "normal" && input.afterAutomaticEnd) {
    // Une seule information à la fois : pas de nouvelle alerte si une est encore ouverte.
    const [open] = await tx
      .select({ id: alerts.id })
      .from(alerts)
      .where(
        and(
          eq(alerts.followupId, input.followupId),
          ne(alerts.status, "resolved"),
        ),
      )
      .limit(1);
    if (!open)
      assessment = {
        level: "watch",
        ruleId: null,
        reason: "Le propriétaire a réécrit après la fin du suivi automatisé.",
        code: "after_end",
      };
  }
  const [event] = await tx
    .insert(triageEvents)
    .values({
      organizationId: input.organizationId,
      followupId: input.followupId,
      messageId: input.messageId,
      level: assessment.level,
      source: "rule",
      followupAlertRuleId: assessment.ruleId,
      reason: assessment.reason,
      reasonCode: assessment.code,
      createdAt: now,
    })
    .returning({ id: triageEvents.id });
  if (!event) throw new Error("Évaluation non enregistrée");
  if (assessment.level === "normal") return { level: "normal", alertId: null };

  const level: AlertLevel = assessment.level;
  const period = emergencyPeriod(now, await messageWindows(tx));
  const target = await recipientFor(
    tx,
    input.responsibleMembershipId,
    period,
    now,
  );
  const [settings] = await tx
    .select({ delay: organizationSettings.escalationDelayMinutes })
    .from(organizationSettings);
  const escalateAt =
    level === "urgent" ? escalationTime(now, settings?.delay ?? 240) : null;
  const [alert] = await tx
    .insert(alerts)
    .values({
      organizationId: input.organizationId,
      followupId: input.followupId,
      triageEventId: event.id,
      level,
      targetMembershipId: target,
      escalateAt,
      createdAt: now,
    })
    .returning({ id: alerts.id });
  if (!alert) throw new Error("Alerte non enregistrée");
  // Traçabilité sans contenu clinique : le niveau et l'identifiant suffisent.
  await auditSystem(
    tx,
    input.organizationId,
    "alert.raised",
    input.followupId,
    {
      alertId: alert.id,
      level,
    },
  );

  const [followup] = await tx
    .select({ triage: followups.triage })
    .from(followups)
    .where(eq(followups.id, input.followupId));
  await tx
    .update(followups)
    .set({ triage: higherLevel(followup?.triage ?? "normal", level) })
    .where(eq(followups.id, input.followupId));

  await enqueue(tx, {
    organizationId: input.organizationId,
    kind: "alert.notify",
    idempotencyKey: `alert:${alert.id}:notify`,
    runAt: now,
    followupId: input.followupId,
    payload: { alertId: alert.id },
  });
  if (escalateAt)
    await enqueue(tx, {
      organizationId: input.organizationId,
      kind: "alert.escalate",
      idempotencyKey: `alert:${alert.id}:escalate`,
      runAt: escalateAt,
      followupId: input.followupId,
      payload: { alertId: alert.id },
    });
  return { level, alertId: alert.id };
}

/** Consignes d'urgence de la période en cours et numéros à appeler, pour le propriétaire. */
export async function emergencyGuidance(
  tx: TenantTransaction,
  now = new Date(),
): Promise<{
  instructions: string;
  contacts: { label: string; phone: string }[];
}> {
  const period = emergencyPeriod(now, await messageWindows(tx));
  const [row] = await tx
    .select({ instructions: emergencyInstructions.instructions })
    .from(emergencyInstructions)
    .where(eq(emergencyInstructions.period, period));
  const contacts = await tx
    .select({ label: emergencyContacts.label, phone: emergencyContacts.phone })
    .from(emergencyContacts)
    .orderBy(asc(emergencyContacts.position));
  return {
    instructions: row?.instructions ?? DEFAULT_INSTRUCTIONS[period],
    contacts,
  };
}

async function auditSystem(
  tx: TenantTransaction,
  organizationId: string,
  action: string,
  followupId: string,
  metadata: AuditMetadata = {},
) {
  await tx.insert(auditEvents).values({
    organizationId,
    actorMembershipId: null,
    action,
    targetType: "followup",
    targetId: followupId,
    metadata,
  });
}

/** Tâches `alert.notify` et `alert.escalate`. */
export function alertHandlers(deps: {
  whatsapp: WhatsAppConnector;
  clock?: () => Date;
}): Record<string, JobHandler> {
  const { whatsapp, clock = () => new Date() } = deps;

  async function notify(
    tx: TenantTransaction,
    alert: { id: string; organizationId: string },
    membershipId: string,
    channel: "whatsapp" | "desktop",
    kind: "urgent" | "escalation",
  ) {
    const key = `alert:${alert.id}:${kind}:${channel}:${membershipId}`;
    await tx
      .insert(notificationDeliveries)
      .values({
        organizationId: alert.organizationId,
        channel,
        recipientMembershipId: membershipId,
        alertId: alert.id,
        idempotencyKey: key,
      })
      .onConflictDoNothing({
        target: [
          notificationDeliveries.organizationId,
          notificationDeliveries.idempotencyKey,
        ],
      });
    const [delivery] = await tx
      .select({
        id: notificationDeliveries.id,
        status: notificationDeliveries.status,
      })
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.idempotencyKey, key));
    if (!delivery || delivery.status !== "pending") return;
    // Sur l'ordinateur : l'alerte s'affiche dans Stivea Vet, rien ne sort.
    let externalRef: string | null = null;
    if (channel === "whatsapp")
      try {
        ({ externalRef } = await whatsapp.sendStaffAlert({
          membershipId,
          kind,
          idempotencyKey: key,
        }));
      } catch {
        throw new JobError("provider_unavailable");
      }
    await tx
      .update(notificationDeliveries)
      .set({ status: "sent", sentAt: clock(), externalRef })
      .where(eq(notificationDeliveries.id, delivery.id));
  }

  async function loadAlert(tx: TenantTransaction, payload: unknown) {
    const parsed = alertPayload.safeParse(payload);
    if (!parsed.success) throw new JobError("invalid_payload");
    const [alert] = await tx
      .select()
      .from(alerts)
      .where(eq(alerts.id, parsed.data.alertId))
      .for("update");
    if (!alert) throw new JobError("target_missing");
    return alert;
  }

  const notifyHandler: JobHandler = async ({ tx, job }) => {
    const alert = await loadAlert(tx, job.payload);
    if (alert.status === "resolved") return;
    await notify(
      tx,
      alert,
      alert.targetMembershipId,
      alert.level === "urgent" ? "whatsapp" : "desktop",
      "urgent",
    );
  };

  const escalateHandler: JobHandler = async ({ tx, job }) => {
    const alert = await loadAlert(tx, job.payload);
    // Reçue ou close entre-temps : plus d'escalade.
    if (alert.status !== "open" || !alert.escalateAt) return;
    const now = clock();
    if (now.getTime() < alert.escalateAt.getTime()) {
      // Jamais avant l'heure : exécutée trop tôt, la tâche est replanifiée.
      await enqueue(tx, {
        organizationId: alert.organizationId,
        kind: "alert.escalate",
        idempotencyKey: `alert:${alert.id}:escalate:${randomUUID()}`,
        runAt: alert.escalateAt,
        followupId: alert.followupId,
        payload: { alertId: alert.id },
      });
      return;
    }
    await tx
      .update(alerts)
      .set({ status: "escalated", escalatedAt: now })
      .where(eq(alerts.id, alert.id));
    const others = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          inArray(memberships.role, [...VET_ROLES]),
          isNull(memberships.deactivatedAt),
          ne(memberships.id, alert.targetMembershipId),
        ),
      );
    for (const other of others)
      await notify(tx, alert, other.id, "whatsapp", "escalation");
    await auditSystem(
      tx,
      alert.organizationId,
      "alert.escalated",
      alert.followupId,
      {
        alertId: alert.id,
        recipients: others.length,
      },
    );
  };

  return { "alert.notify": notifyHandler, "alert.escalate": escalateHandler };
}

export function alertsService(db: Database) {
  const run = <T>(actor: Actor, fn: (tx: TenantTransaction) => Promise<T>) =>
    withTenant(
      db,
      { organizationId: actor.organizationId, userId: actor.userId },
      fn,
    );

  async function audit(
    tx: TenantTransaction,
    actor: Actor,
    action: string,
    followupId: string,
    metadata: AuditMetadata,
  ) {
    await tx.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.membershipId,
      action,
      targetType: "followup",
      targetId: followupId,
      metadata,
    });
  }

  /** Alerte visible et modifiable par un vétérinaire ayant l'accès clinique au dossier. */
  async function lockAlert(
    tx: TenantTransaction,
    actor: Actor,
    alertId: string,
  ) {
    if (!uuid.safeParse(alertId).success) throw new DomainError("not_found");
    const [alert] = await tx
      .select()
      .from(alerts)
      .where(eq(alerts.id, alertId))
      .for("update");
    if (!alert) throw new DomainError("not_found");
    const followup = await loadFollowup(tx, actor, alert.followupId);
    if (followup.access !== "clinical") throw new DomainError("not_found");
    if (!VET_ROLES.has(actor.role)) throw new DomainError("forbidden");
    return alert;
  }

  async function acknowledgeInTx(
    tx: TenantTransaction,
    actor: Actor,
    alert: typeof alerts.$inferSelect,
  ) {
    await tx
      .insert(acknowledgements)
      .values({
        organizationId: actor.organizationId,
        alertId: alert.id,
        membershipId: actor.membershipId,
      })
      .onConflictDoNothing();
    // L'escalade prévue est abandonnée.
    await tx
      .update(scheduledJobs)
      .set({ status: "cancelled", finishedAt: new Date() })
      .where(
        and(
          eq(scheduledJobs.kind, "alert.escalate"),
          eq(scheduledJobs.status, "pending"),
          sql`${scheduledJobs.payload} ->> 'alertId' = ${alert.id}`,
        ),
      );
  }

  async function listAlerts(
    tx: TenantTransaction,
    actor: Actor,
    filter: { followupId?: string; openOnly: boolean },
  ): Promise<AlertView[]> {
    const rows = await tx
      .select({
        id: alerts.id,
        followupId: alerts.followupId,
        animalName: animals.name,
        level: alerts.level,
        status: alerts.status,
        ...triageReasonColumns,
        targetName: users.displayName,
        createdAt: alerts.createdAt,
        escalateAt: alerts.escalateAt,
        escalatedAt: alerts.escalatedAt,
        responsibleMembershipId: followups.responsibleMembershipId,
        isPrivate: followups.isPrivate,
      })
      .from(alerts)
      .innerJoin(triageEvents, eq(triageEvents.id, alerts.triageEventId))
      .leftJoin(followupAlertRules, triageRuleJoin)
      .innerJoin(followups, eq(followups.id, alerts.followupId))
      .innerJoin(animals, eq(animals.id, followups.animalId))
      .innerJoin(memberships, eq(memberships.id, alerts.targetMembershipId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          filter.followupId
            ? eq(alerts.followupId, filter.followupId)
            : undefined,
          filter.openOnly ? ne(alerts.status, "resolved") : undefined,
        ),
      )
      .orderBy(desc(alerts.createdAt))
      .limit(100);
    if (!rows.length) return [];
    const now = new Date();
    const shares = await tx
      .select({
        followupId: followupShares.followupId,
        membershipId: followupShares.membershipId,
      })
      .from(followupShares)
      .where(
        and(
          inArray(
            followupShares.followupId,
            rows.map((row) => row.followupId),
          ),
          isNull(followupShares.revokedAt),
          or(
            isNull(followupShares.expiresAt),
            gt(followupShares.expiresAt, now),
          ),
        ),
      );
    const acks = await tx
      .select({
        alertId: acknowledgements.alertId,
        name: users.displayName,
        at: acknowledgements.acknowledgedAt,
      })
      .from(acknowledgements)
      .innerJoin(memberships, eq(memberships.id, acknowledgements.membershipId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        inArray(
          acknowledgements.alertId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(asc(acknowledgements.acknowledgedAt));
    const isVet = VET_ROLES.has(actor.role);
    return rows
      .filter(
        (row) =>
          followupAccess(actor, {
            responsibleMembershipId: row.responsibleMembershipId,
            isPrivate: row.isPrivate,
            sharedWith: shares
              .filter((share) => share.followupId === row.followupId)
              .map((share) => share.membershipId),
          }) === "clinical",
      )
      .map((row) => {
        const ack = acks.find((entry) => entry.alertId === row.id);
        return {
          id: row.id,
          followupId: row.followupId,
          animalName: row.animalName,
          level: row.level,
          status: row.status,
          reason: triageReason(row),
          targetName: row.targetName,
          createdAt: row.createdAt,
          escalateAt: row.escalateAt,
          escalatedAt: row.escalatedAt,
          acknowledgedBy: ack?.name ?? null,
          acknowledgedAt: ack?.at ?? null,
          canAcknowledge: isVet && row.status !== "resolved",
        };
      });
  }

  return {
    /** Alertes non closes des dossiers que l'acteur peut lire en clinique. */
    async open(actor: Actor): Promise<AlertView[]> {
      if (!actor.permissions.has("clinical.read")) return [];
      return run(actor, (tx) => listAlerts(tx, actor, { openOnly: true }));
    },

    /** Alertes d'un dossier, closes comprises. */
    async ofFollowup(actor: Actor, followupId: string): Promise<AlertView[]> {
      assertPermission(actor, "clinical.read");
      return run(actor, async (tx) => {
        const followup = await loadFollowup(tx, actor, followupId);
        if (followup.access !== "clinical") throw new DomainError("not_found");
        return listAlerts(tx, actor, { followupId, openOnly: false });
      });
    },

    /** « Accuser réception » : arrête l'escalade d'une urgence. Décision de vétérinaire. */
    async acknowledge(actor: Actor, alertId: string) {
      assertPermission(actor, "clinical.read");
      return run(actor, async (tx) => {
        const alert = await lockAlert(tx, actor, alertId);
        if (alert.status !== "open" && alert.status !== "escalated")
          throw new DomainError("invalid_transition");
        await acknowledgeInTx(tx, actor, alert);
        await tx
          .update(alerts)
          .set({ status: "acknowledged" })
          .where(eq(alerts.id, alert.id));
        await audit(tx, actor, "alert.acknowledged", alert.followupId, {
          alertId: alert.id,
          level: alert.level,
          escalated: alert.status === "escalated",
        });
        return alert.followupId;
      });
    },

    /** « Clore l'alerte » : la priorité du suivi est recalculée. Vaut accusé de réception. */
    async resolve(actor: Actor, alertId: string, now = new Date()) {
      assertPermission(actor, "clinical.read");
      return run(actor, async (tx) => {
        const alert = await lockAlert(tx, actor, alertId);
        if (alert.status === "resolved")
          throw new DomainError("invalid_transition");
        await acknowledgeInTx(tx, actor, alert);
        await tx
          .update(alerts)
          .set({
            status: "resolved",
            resolvedAt: now,
            resolvedByMembershipId: actor.membershipId,
          })
          .where(eq(alerts.id, alert.id));
        await refreshFollowupTriage(tx, alert.followupId);
        await audit(tx, actor, "alert.resolved", alert.followupId, {
          alertId: alert.id,
          level: alert.level,
        });
        return alert.followupId;
      });
    },
  };
}

export type AlertsService = ReturnType<typeof alertsService>;
