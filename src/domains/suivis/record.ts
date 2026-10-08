import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import {
  acknowledgements,
  alerts,
  animals,
  attachments,
  consents,
  followupContacts,
  followupImports,
  followupTreatments,
  followups,
  memberships,
  messages,
  ownerContacts,
  owners,
  triageEvents,
  users,
  voiceTranscripts,
} from "@/server/db/schema";
import type { TenantTransaction } from "@/server/db/tenant";

/**
 * Contenu d'un dossier de suivi (phase 2). Comme pour `FollowupView`, chaque vue est construite
 * champ par champ : la partie clinique (messages, pièces jointes, transcriptions, triage,
 * alertes) n'est jamais lue en base pour une personne qui n'y a pas droit.
 */

export type ConsentStateView = "requested" | "given" | "withdrawn";

/** Contact du suivi, sans numéro de téléphone : seulement ses deux derniers chiffres. */
export type FollowupContactView = {
  id: string;
  name: string;
  /** Deux derniers chiffres du numéro WhatsApp, pour reconnaître le contact. */
  phoneEnding: string | null;
  role: "primary" | "secondary";
  active: boolean;
  language: "fr" | "en";
  leftGroup: boolean;
  /** Dernier état connu ; null si l'accord n'a pas encore été demandé. */
  consent: ConsentStateView | null;
};

export type AttachmentView = {
  id: string;
  kind: "photo" | "voice" | "document";
  /** Fichier déjà effacé (conservation échue) : seule la trace reste. */
  deleted: boolean;
  transcript: string | null;
};

export type MessageView = {
  id: string;
  author: "owner" | "numa" | "vet" | "system";
  authorName: string | null;
  body: string;
  occurredAt: Date;
  delivery: "queued" | "sent" | "delivered" | "read" | "failed" | null;
  attachments: AttachmentView[];
};

export type TriageEventView = {
  id: string;
  level: "normal" | "watch" | "urgent";
  source: "rule" | "ai" | "vet";
  reason: string;
  messageId: string | null;
  at: Date;
};

export type AlertView = {
  id: string;
  level: "watch" | "urgent";
  status: "open" | "acknowledged" | "escalated" | "resolved";
  targetName: string;
  createdAt: Date;
  escalateAt: Date | null;
  acknowledgedBy: string[];
};

/** Traitement de la fiche : importé de dr.veto ou ajouté, validé ou en attente. */
export type TreatmentView = {
  id: string;
  source: "drveto" | "vet";
  name: string;
  instructions: string;
  /** Vétérinaire qui l'a validé ; null tant qu'il ne l'est pas (aucun rappel). */
  validatedBy: string | null;
};

/** Ce que le dossier montre de l'animal et du résumé importé (accès clinique). */
export type ClinicalFacts = {
  animal: {
    breed: string | null;
    /** `AAAA-MM-JJ`. */
    birthDate: string | null;
    weightGrams: number | null;
  };
  treatments: TreatmentView[];
  /** Résumé importé de dr.veto au lancement ; null si le suivi n'en a pas. */
  imported: { allergies: string[]; antecedents: string[] } | null;
};

export type FollowupRecord =
  | { access: "summary"; contacts: FollowupContactView[] }
  | {
      access: "clinical";
      contacts: FollowupContactView[];
      messages: MessageView[];
      triage: TriageEventView[];
      alerts: AlertView[];
      facts: ClinicalFacts;
    };

async function loadContacts(
  tx: TenantTransaction,
  followupId: string,
): Promise<FollowupContactView[]> {
  const rows = await tx
    .select({
      id: followupContacts.id,
      name: owners.fullName,
      role: followupContacts.role,
      active: followupContacts.active,
      language: followupContacts.language,
      leftGroupAt: followupContacts.leftGroupAt,
      phone: ownerContacts.value,
    })
    .from(followupContacts)
    .innerJoin(owners, eq(owners.id, followupContacts.ownerId))
    .innerJoin(
      ownerContacts,
      eq(ownerContacts.id, followupContacts.ownerContactId),
    )
    .where(eq(followupContacts.followupId, followupId))
    .orderBy(asc(followupContacts.role));
  const history = await tx
    .select({
      contactId: consents.followupContactId,
      state: consents.state,
    })
    .from(consents)
    .where(eq(consents.followupId, followupId))
    .orderBy(desc(consents.recordedAt), desc(consents.id));
  const latest = new Map<string, ConsentStateView>();
  for (const row of history)
    if (!latest.has(row.contactId)) latest.set(row.contactId, row.state);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    // Le numéro complet ne quitte jamais cette fonction.
    phoneEnding: row.phone.replace(/\D/g, "").slice(-2) || null,
    role: row.role,
    active: row.active,
    language: row.language,
    leftGroup: row.leftGroupAt !== null,
    consent: latest.get(row.id) ?? null,
  }));
}

async function loadMessages(
  tx: TenantTransaction,
  followupId: string,
): Promise<MessageView[]> {
  const rows = await tx
    .select({
      id: messages.id,
      author: messages.author,
      ownerName: owners.fullName,
      vetName: users.displayName,
      body: messages.body,
      occurredAt: messages.occurredAt,
      delivery: messages.deliveryStatus,
    })
    .from(messages)
    .leftJoin(
      followupContacts,
      and(
        eq(followupContacts.id, messages.followupContactId),
        eq(messages.author, "owner"),
      ),
    )
    .leftJoin(owners, eq(owners.id, followupContacts.ownerId))
    .leftJoin(memberships, eq(memberships.id, messages.authorMembershipId))
    .leftJoin(users, eq(users.id, memberships.userId))
    .where(eq(messages.followupId, followupId))
    .orderBy(asc(messages.occurredAt), asc(messages.id));

  const files = await tx
    .select({
      id: attachments.id,
      messageId: attachments.messageId,
      kind: attachments.kind,
      deletedAt: attachments.deletedAt,
      transcript: voiceTranscripts.text,
    })
    .from(attachments)
    .leftJoin(
      voiceTranscripts,
      eq(voiceTranscripts.attachmentId, attachments.id),
    )
    .where(eq(attachments.followupId, followupId))
    .orderBy(asc(attachments.createdAt));
  const filesByMessage = new Map<string, AttachmentView[]>();
  for (const file of files) {
    if (!file.messageId || file.kind === "agenda_capture") continue;
    const list = filesByMessage.get(file.messageId) ?? [];
    list.push({
      id: file.id,
      kind: file.kind,
      deleted: file.deletedAt !== null,
      // Un fichier effacé l'est avec sa transcription.
      transcript: file.deletedAt ? null : file.transcript,
    });
    filesByMessage.set(file.messageId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    author: row.author,
    authorName:
      row.author === "owner"
        ? row.ownerName
        : row.author === "vet"
          ? row.vetName
          : null,
    body: row.body,
    occurredAt: row.occurredAt,
    delivery: row.delivery,
    attachments: filesByMessage.get(row.id) ?? [],
  }));
}

async function loadTriage(
  tx: TenantTransaction,
  followupId: string,
): Promise<TriageEventView[]> {
  const rows = await tx
    .select({
      id: triageEvents.id,
      level: triageEvents.level,
      source: triageEvents.source,
      reason: triageEvents.reason,
      messageId: triageEvents.messageId,
      at: triageEvents.createdAt,
    })
    .from(triageEvents)
    .where(eq(triageEvents.followupId, followupId))
    .orderBy(desc(triageEvents.createdAt), desc(triageEvents.id));
  return rows.map((row) => ({
    id: row.id,
    level: row.level,
    source: row.source,
    reason: row.reason,
    messageId: row.messageId,
    at: row.at,
  }));
}

async function loadAlerts(
  tx: TenantTransaction,
  followupId: string,
): Promise<AlertView[]> {
  const rows = await tx
    .select({
      id: alerts.id,
      level: alerts.level,
      status: alerts.status,
      targetName: users.displayName,
      createdAt: alerts.createdAt,
      escalateAt: alerts.escalateAt,
    })
    .from(alerts)
    .innerJoin(memberships, eq(memberships.id, alerts.targetMembershipId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(alerts.followupId, followupId))
    .orderBy(desc(alerts.createdAt));
  const acks = rows.length
    ? await tx
        .select({ alertId: acknowledgements.alertId, name: users.displayName })
        .from(acknowledgements)
        .innerJoin(
          memberships,
          eq(memberships.id, acknowledgements.membershipId),
        )
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          inArray(
            acknowledgements.alertId,
            rows.map((row) => row.id),
          ),
        )
        .orderBy(asc(acknowledgements.acknowledgedAt))
    : [];
  return rows.map((row) => ({
    id: row.id,
    level: row.level,
    status: row.status,
    targetName: row.targetName,
    createdAt: row.createdAt,
    escalateAt: row.escalateAt,
    acknowledgedBy: acks
      .filter((ack) => ack.alertId === row.id)
      .map((ack) => ack.name),
  }));
}

async function loadFacts(
  tx: TenantTransaction,
  followupId: string,
): Promise<ClinicalFacts> {
  const [animal] = await tx
    .select({
      breed: animals.breed,
      birthDate: animals.birthDate,
      weightGrams: animals.weightGrams,
    })
    .from(followups)
    .innerJoin(animals, eq(animals.id, followups.animalId))
    .where(eq(followups.id, followupId));
  const treatments = await tx
    .select({
      id: followupTreatments.id,
      source: followupTreatments.source,
      name: followupTreatments.name,
      instructions: followupTreatments.instructions,
      validatedBy: users.displayName,
    })
    .from(followupTreatments)
    .leftJoin(
      memberships,
      eq(memberships.id, followupTreatments.validatedByMembershipId),
    )
    .leftJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(followupTreatments.followupId, followupId),
        isNull(followupTreatments.removedAt),
      ),
    )
    .orderBy(asc(followupTreatments.createdAt), asc(followupTreatments.id));
  const [imported] = await tx
    .select({
      allergies: followupImports.allergies,
      antecedents: followupImports.antecedents,
    })
    .from(followupImports)
    .where(eq(followupImports.followupId, followupId));
  return {
    animal: {
      breed: animal?.breed ?? null,
      birthDate: animal?.birthDate ?? null,
      weightGrams: animal?.weightGrams ?? null,
    },
    treatments: treatments.map((row) => ({
      id: row.id,
      source: row.source,
      name: row.name,
      instructions: row.instructions,
      validatedBy: row.validatedBy,
    })),
    imported: imported
      ? { allergies: imported.allergies, antecedents: imported.antecedents }
      : null,
  };
}

export async function loadFollowupRecord(
  tx: TenantTransaction,
  followupId: string,
  access: "summary" | "clinical",
): Promise<FollowupRecord> {
  const contacts = await loadContacts(tx, followupId);
  if (access === "summary") return { access, contacts };
  return {
    access,
    contacts,
    messages: await loadMessages(tx, followupId),
    triage: await loadTriage(tx, followupId),
    alerts: await loadAlerts(tx, followupId),
    facts: await loadFacts(tx, followupId),
  };
}
