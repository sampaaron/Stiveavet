import { createHash } from "node:crypto";

import { and, eq, isNull, lt, sql } from "drizzle-orm";

import { alertRules } from "../../src/domains/protocoles/schema";
import { parisLocalToDate } from "../../src/domains/reglages/content";
import { parisDayIndex } from "../../src/domains/suivis/calendrier";
import { copyProtocolPlan } from "../../src/domains/suivis/lancement";
import {
  scheduleAutomaticEnd,
  scheduleReminders,
} from "../../src/domains/suivis/rappels";
import { assessOwnerMessage } from "../../src/domains/urgences/triage";
import type { Followup, Message, Triage } from "../../src/fixtures/types";
import {
  acknowledgements,
  alerts,
  appointments,
  attachments,
  consents,
  conversationThreads,
  followupContacts,
  followupImports,
  followupSteps,
  followupTreatments,
  followups,
  jobAttempts,
  messages,
  notificationDeliveries,
  outboxEvents,
  scheduledJobs,
  triageEvents,
  voiceTranscripts,
} from "../../src/server/db/schema";
import type { TenantTransaction } from "../../src/server/db/tenant";

import type { SeededContact } from "./cabinets-fictifs";

/**
 * Dossiers fictifs (phase 2, lots 10 et 17) : contacts, consentements, conversation, pièces
 * jointes, triage, alertes, résumé importé, traitements validés, programme du protocole,
 * rendez-vous et tâches, tirés des données des écrans de référence.
 * Les fichiers n'existent pas : seules leurs clés de stockage fictives sont enregistrées.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ESCALATION_DELAY_MINUTES = 240;
const CONSENT_WORDING = "2026-10-projet";

/** Heure d'un message des écrans de référence (« Hier » / « Aujourd'hui », « 21 h 12 »). */
function messageTime(message: Message, now: Date): Date {
  const [hours = 0, minutes = 0] = message.at
    .split("h")
    .map((part) => Number(part.trim()) || 0);
  const day = new Date(now);
  day.setHours(hours, minutes, 0, 0);
  if (message.dayLabel === "Hier") day.setTime(day.getTime() - DAY);
  return day;
}

/** Heures des messages, décalées si besoin pour que le dernier soit déjà passé. */
function conversationTimes(list: Message[], now: Date): Date[] {
  const times = list.map((message) => messageTime(message, now));
  const latest = Math.max(...times.map((time) => time.getTime()));
  const shift = Math.max(0, latest - (now.getTime() - 5 * 60_000));
  return times.map((time) => new Date(time.getTime() - shift));
}

/**
 * Contrôle de chaque animal fictif, relatif au jour du seed (heure de Paris), comme sur les
 * écrans de référence : Moka a rendez-vous aujourd'hui, confirmé via Stivea Vet.
 */
const CONTROLS: Record<
  string,
  { inDays: number; at: string; source: "numa" | "staff" }
> = {
  Caramel: { inDays: 5, at: "17:15", source: "staff" },
  // Rendez-vous confirmés par le cabinet : Numa ne fait que proposer (trigger de la 0014).
  Moka: { inDays: 0, at: "14:30", source: "staff" },
  Pixel: { inDays: 8, at: "11:00", source: "staff" },
  Ruby: { inDays: 2, at: "09:30", source: "staff" },
  Oscar: { inDays: 13, at: "10:00", source: "staff" },
  Nala: { inDays: 7, at: "15:00", source: "staff" },
  Filou: { inDays: 3, at: "10:00", source: "staff" },
};

export function controlOf(
  data: Followup,
  now: Date,
): { at: Date; source: "numa" | "staff" } | null {
  if (data.state === "ended") return null;
  const plan = CONTROLS[data.animal.name] ?? {
    inDays: 7,
    at: "17:15",
    source: "staff" as const,
  };
  const day = new Date((parisDayIndex(now) + plan.inDays) * DAY)
    .toISOString()
    .slice(0, 10);
  const at = parisLocalToDate(`${day}T${plan.at}`);
  return at ? { at, source: plan.source } : null;
}

function fakeFile(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export async function insertFollowupRecord(
  tx: TenantTransaction,
  organizationId: string,
  responsibleMembershipId: string,
  data: Followup,
  seeded: {
    animalId: string;
    startedAt: Date;
    contacts: SeededContact[];
    protocolVersionId: string | null;
  },
  now = new Date(),
) {
  const followupId = data.id;
  const retentionUntil = new Date(now.getTime() + 365 * DAY);

  // Contacts et consentements -----------------------------------------------------------
  const contactIds = new Map<string, string>();
  const twoOwners = seeded.contacts.length > 1;
  for (const contact of seeded.contacts) {
    const [row] = await tx
      .insert(followupContacts)
      .values({
        organizationId,
        followupId,
        ownerId: contact.ownerId,
        ownerContactId: contact.ownerContactId,
        role: contact.owner.role === "principal" ? "primary" : "secondary",
        language: contact.owner.language,
      })
      .returning({ id: followupContacts.id });
    if (!row) throw new Error("Insertion du contact de suivi impossible");
    contactIds.set(contact.owner.name, row.id);

    const states: Array<"requested" | "given" | "withdrawn"> = ["requested"];
    if (contact.owner.consent !== "pending") states.push("given");
    if (contact.owner.consent === "stopped") states.push("withdrawn");
    for (const [index, state] of states.entries())
      await tx.insert(consents).values({
        organizationId,
        followupId,
        followupContactId: row.id,
        state,
        wordingVersion: CONSENT_WORDING,
        groupExplained: twoOwners,
        recordedAt: new Date(seeded.startedAt.getTime() + index * 60_000),
      });
  }
  const primaryName = seeded.contacts.find(
    (contact) => contact.owner.role === "principal",
  )?.owner.name;
  const primaryId = primaryName ? contactIds.get(primaryName) : undefined;
  if (!primaryId) throw new Error("Suivi fictif sans contact principal");

  // Conversation ------------------------------------------------------------------------
  const threadIds = new Map<string, string>();
  for (const [name, contactId] of contactIds) {
    const [thread] = await tx
      .insert(conversationThreads)
      .values({
        organizationId,
        followupId,
        kind: "direct",
        followupContactId: contactId,
        externalRef: `simule:${followupId}:${contactId}`,
        openedAt: seeded.startedAt,
      })
      .returning({ id: conversationThreads.id });
    if (!thread) throw new Error("Insertion du fil impossible");
    threadIds.set(name, thread.id);
  }
  const primaryThread = primaryName ? threadIds.get(primaryName) : undefined;
  if (!primaryThread) throw new Error("Fil principal introuvable");

  // Motifs de triage : ceux qu'écrirait le triage déterministe (lot 14) avec les signes
  // d'alerte du protocole ; le niveau reste celui des écrans de référence.
  const rules = seeded.protocolVersionId
    ? await tx
        .select({
          id: alertRules.id,
          level: alertRules.level,
          description: alertRules.description,
        })
        .from(alertRules)
        .where(eq(alertRules.protocolVersionId, seeded.protocolVersionId))
    : [];
  const triageReason = (text: string, level: Triage) => {
    const assessed = assessOwnerMessage(text, rules);
    if (assessed.level === level) return assessed.reason;
    return level === "normal"
      ? "Aucun signe d'alerte."
      : level === "urgent"
        ? "Signal d'urgence reconnu dans le message du propriétaire."
        : "Inquiétude ou signe à vérifier, sans signe d'alerte reconnu : escaladé par prudence.";
  };

  const times = conversationTimes(data.messages, now);
  let lastAlertTriage: {
    id: string;
    level: "watch" | "urgent";
    at: Date;
  } | null = null;
  for (const [index, message] of data.messages.entries()) {
    const occurredAt = times[index] ?? now;
    const outbound = message.author === "numa" || message.author === "vet";
    const contactId =
      message.author === "owner"
        ? (contactIds.get(message.authorName ?? "") ?? primaryId)
        : outbound
          ? primaryId
          : null;
    const [row] = await tx
      .insert(messages)
      .values({
        organizationId,
        followupId,
        threadId: primaryThread,
        direction:
          message.author === "owner"
            ? "inbound"
            : outbound
              ? "outbound"
              : "internal",
        author: message.author,
        followupContactId: contactId,
        authorMembershipId:
          message.author === "vet" ? responsibleMembershipId : null,
        body: message.text,
        language: message.author === "system" ? null : "fr",
        deliveryStatus: outbound ? "read" : null,
        idempotencyKey: outbound ? `seed:${followupId}:${message.id}` : null,
        occurredAt,
        sentAt: outbound ? occurredAt : null,
        deliveredAt: outbound ? occurredAt : null,
        readAt: outbound ? occurredAt : null,
      })
      .returning({ id: messages.id });
    if (!row) throw new Error("Insertion du message impossible");

    // Fichiers fictifs : seule la trace est en base, aucun objet dans le stockage.
    if (message.attachment && message.attachment.kind !== "deleted") {
      const voice = message.attachment.kind === "voice";
      const storageKey = `fictif/${organizationId}/${followupId}/${message.id}.${voice ? "ogg" : "jpg"}`;
      const [file] = await tx
        .insert(attachments)
        .values({
          organizationId,
          followupId,
          messageId: row.id,
          kind: message.attachment.kind,
          storageKey,
          contentType: voice ? "audio/ogg" : "image/jpeg",
          byteSize: voice ? 42_000 : 240_000,
          sha256: fakeFile(storageKey),
          retentionUntil,
          createdAt: occurredAt,
        })
        .returning({ id: attachments.id });
      if (!file) throw new Error("Insertion de la pièce jointe impossible");
      if (message.attachment.kind === "voice" && message.attachment.transcript)
        await tx.insert(voiceTranscripts).values({
          organizationId,
          followupId,
          attachmentId: file.id,
          text: message.attachment.transcript,
          language: "fr",
        });
    }

    if (message.triage) {
      const [event] = await tx
        .insert(triageEvents)
        .values({
          organizationId,
          followupId,
          messageId: row.id,
          level: message.triage,
          source: "rule",
          reason: triageReason(
            [
              message.text,
              message.attachment?.kind === "voice"
                ? message.attachment.transcript
                : null,
            ]
              .filter(Boolean)
              .join(" "),
            message.triage,
          ),
          createdAt: occurredAt,
        })
        .returning({ id: triageEvents.id });
      if (event && message.triage !== "normal")
        lastAlertTriage = {
          id: event.id,
          level: message.triage,
          at: occurredAt,
        };
    }
  }

  // Alerte ouverte, sans accusé de réception (comme sur les écrans de référence) ------------
  if (lastAlertTriage && data.triage !== "normal") {
    const urgent = lastAlertTriage.level === "urgent";
    const [alert] = await tx
      .insert(alerts)
      .values({
        organizationId,
        followupId,
        triageEventId: lastAlertTriage.id,
        level: lastAlertTriage.level,
        targetMembershipId: responsibleMembershipId,
        escalateAt: urgent
          ? new Date(
              lastAlertTriage.at.getTime() + ESCALATION_DELAY_MINUTES * 60_000,
            )
          : null,
        createdAt: lastAlertTriage.at,
      })
      .returning({ id: alerts.id, escalateAt: alerts.escalateAt });
    if (!alert) throw new Error("Insertion de l'alerte impossible");
    await tx.insert(notificationDeliveries).values({
      organizationId,
      channel: urgent ? "whatsapp" : "desktop",
      recipientMembershipId: responsibleMembershipId,
      alertId: alert.id,
      idempotencyKey: `seed:alert:${alert.id}`,
      status: "sent",
      sentAt: lastAlertTriage.at,
    });
    if (alert.escalateAt)
      await tx.insert(scheduledJobs).values({
        organizationId,
        kind: "alert.escalate",
        followupId,
        payload: { alertId: alert.id },
        idempotencyKey: `seed:escalate:${alert.id}`,
        runAt: alert.escalateAt,
      });
    // Un « à surveiller » déjà vu par le responsable.
    if (!urgent)
      await tx.insert(acknowledgements).values({
        organizationId,
        alertId: alert.id,
        membershipId: responsibleMembershipId,
        acknowledgedAt: new Date(lastAlertTriage.at.getTime() + 20 * 60_000),
      });
  }

  // Résumé importé de dr.veto et traitements validés ------------------------------------------
  await tx.insert(followupImports).values({
    followupId,
    organizationId,
    source: "drveto_simulated",
    externalRef: `DV-SEED-${followupId.slice(0, 8)}`,
    allergies: data.allergies.filter(
      (entry) => entry !== "Aucune allergie connue",
    ),
    antecedents: [],
    importedByMembershipId: responsibleMembershipId,
    importedAt: seeded.startedAt,
  });
  for (const treatment of data.treatments) {
    const imported = treatment.name.includes("importé de dr.veto");
    await tx.insert(followupTreatments).values({
      organizationId,
      followupId,
      source: imported ? "drveto" : "vet",
      name: treatment.name.replace(/\s*\(importé de dr\.veto\)/, ""),
      instructions: treatment.schedule,
      validatedByMembershipId: responsibleMembershipId,
      validatedAt: seeded.startedAt,
      createdAt: seeded.startedAt,
    });
  }

  // Programme du protocole : seules les étapes à venir restent (celles d'avant le seed
  // n'ont pas de trace d'envoi dans ces conversations écrites à la main).
  if (seeded.protocolVersionId) {
    await copyProtocolPlan(
      tx,
      organizationId,
      followupId,
      seeded.protocolVersionId,
      1,
      seeded.startedAt,
    );
    await tx
      .update(followups)
      .set({ planRevision: 1 })
      .where(eq(followups.id, followupId));
    await tx
      .update(followupSteps)
      .set({ supersededAt: now })
      .where(
        and(
          eq(followupSteps.followupId, followupId),
          isNull(followupSteps.supersededAt),
          lt(
            sql`${seeded.startedAt}::timestamptz + make_interval(hours => ${followupSteps.offsetHours})`,
            now,
          ),
        ),
      );
  }

  // Rendez-vous de contrôle et tâches ---------------------------------------------------------
  const control = controlOf(data, now);
  if (control)
    await tx.insert(appointments).values({
      organizationId,
      followupId,
      animalId: seeded.animalId,
      membershipId: responsibleMembershipId,
      kind: "post_op_control",
      status: "confirmed",
      source: control.source,
      startsAt: control.at,
      endsAt: new Date(control.at.getTime() + 30 * 60_000),
      confirmedByMembershipId: responsibleMembershipId,
      confirmedAt: seeded.startedAt,
    });

  await tx.insert(outboxEvents).values({
    organizationId,
    topic: "followup.launched",
    aggregateType: "followup",
    aggregateId: followupId,
    payload: { followupId },
    createdAt: seeded.startedAt,
    publishedAt: seeded.startedAt,
  });

  // Rappels du programme dans la plage d'envoi, et fin du suivi automatisé au contrôle.
  if (data.state === "active") {
    await scheduleReminders(tx, followupId, now);
    await scheduleAutomaticEnd(tx, followupId, now);
  }

  // Suivi en pause : un rappel bloqué après cinq échecs, visible dans « Tâches en échec ».
  if (data.state === "paused") {
    const firstTry = new Date(now.getTime() - 6 * HOUR);
    const [job] = await tx
      .insert(scheduledJobs)
      .values({
        organizationId,
        kind: "followup.reminder",
        followupId,
        payload: { followupId },
        idempotencyKey: `seed:reminder-failed:${followupId}`,
        status: "dead",
        runAt: firstTry,
        attempts: 5,
        lastErrorCode: "provider_unavailable",
        finishedAt: new Date(firstTry.getTime() + 2 * HOUR),
      })
      .returning({ id: scheduledJobs.id });
    if (!job) throw new Error("Insertion de la tâche impossible");
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const startedAt = new Date(firstTry.getTime() + attempt * 20 * 60_000);
      await tx.insert(jobAttempts).values({
        organizationId,
        jobId: job.id,
        attemptNumber: attempt,
        startedAt,
        finishedAt: new Date(startedAt.getTime() + 2_000),
        outcome: "failed",
        errorCode: "provider_unavailable",
      });
    }
  }
}
