import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { DomainError } from "@/domains/commun/actor";
import {
  AUTOMATIC_END_REASON,
  END_KIND,
  REMINDER_KIND,
  lastStatusReason,
} from "@/domains/suivis/rappels";
import { JobError } from "@/domains/taches/kinds";
import type { TriageLevel } from "@/domains/urgences/triage";
import { SEND_JOB } from "@/domains/whatsapp/envoi";
import { isTemplateKey } from "@/domains/whatsapp/modeles";
import { enqueue } from "@/domains/taches/queue";
import {
  animals,
  consents,
  conversationThreads,
  followupContacts,
  followups,
  memberships,
  messages,
  organizations,
  ownerContacts,
  owners,
  users,
} from "@/server/db/schema";
import type { TenantTransaction } from "@/server/db/tenant";

import type { SystemNoteCode } from "./schema";
import {
  CONSENT_VERSION_OF,
  CONSENT_WORDING_VERSION,
  PAIR_CONSENT_WORDING_VERSION,
  firstName,
} from "./wording";
import type { WordingContext } from "./wording";

/**
 * Contexte d'une conversation : suivi, contacts et accords, destinataires possibles, fil
 * direct, traces dans le groupe et inscription des envois dans la file de tâches.
 */

type Status = "draft" | "active" | "paused" | "human_takeover" | "ended";
export type ConsentState = "requested" | "given" | "withdrawn";
type Consent = {
  id: string;
  state: ConsentState;
  scope: "contact" | "followup";
};

export type ConversationMessage = {
  id: string;
  author: "owner" | "numa" | "vet" | "system";
  authorName: string | null;
  body: string;
  occurredAt: Date;
  /** `awaiting_reply` : hors de la fenêtre de 24 h, il part à la prochaine réponse. */
  delivery:
    | "queued"
    | "awaiting_reply"
    | "sent"
    | "delivered"
    | "read"
    | "failed"
    | null;
  /** Niveau du triage d'un message du propriétaire, s'il a été évalué. */
  triage: TriageLevel | null;
  /** Photo ou message vocal joint (lot 16) ; le fichier se lit par un lien signé. */
  attachment: MessageAttachment | null;
  /** Conversation directe avec un propriétaire, ou groupe des deux (lot 18). */
  channel: "direct" | "group";
  /** Prénom du propriétaire auteur (entrant) ou destinataire (sortant direct). */
  contactName: string | null;
  contactRole: ContactRole | null;
  /** Trace d'un groupe (auteur « system »), affichée dans la langue du lecteur (lot 19). */
  note: SystemNote | null;
};

export type SystemNote = { code: SystemNoteCode; names: string[] };

export type MessageAttachment = {
  id: string;
  kind: "photo" | "voice";
  durationMs: number | null;
  /** Fichier supprimé (conservation échue) : seule la trace reste. */
  deleted: boolean;
  /** Transcription simulée d'un vocal, quand elle est faite. */
  transcript: string | null;
  /** Analyse photo (si activée) : observations seulement, jamais de diagnostic. */
  observations: string[];
};

export type ConversationContact = {
  firstName: string;
  role: "primary" | "secondary";
  consent: ConsentState | null;
  inGroup: boolean;
  leftGroup: boolean;
  leftGroupAt: Date | null;
  /** STOP écrit dans le groupe, réponse GROUPE ou TOUT attendue. */
  stopRequested: boolean;
  /** Langue de Numa avec cette personne, et d'où elle vient (lot 19). */
  language: "fr" | "en";
  languageSource: LanguageSource;
};

export type LanguageSource = "import" | "detected" | "vet";

export type ConversationView = {
  followupId: string;
  status: Status;
  isTest: boolean;
  animalName: string;
  ownerFirstName: string | null;
  /** Accord du contact principal. */
  consent: ConsentState | null;
  contacts: ConversationContact[];
  /** Groupe WhatsApp ouvert. */
  group: boolean;
  /** Prénoms des destinataires d'un message écrit maintenant, ou null. */
  recipients: string[] | null;
  /** Un propriétaire a demandé l'arrêt du suivi entier. */
  stoppedByOwner: boolean;
  /** Terminé à la date de contrôle (et non arrêté par le vétérinaire). */
  endedAutomatically: boolean;
  messages: ConversationMessage[];
  rights: { canWrite: boolean; canResume: boolean };
};

/** Ce que l'arrivée d'un message du propriétaire a déclenché. */
export type InboundOutcome =
  | "consent_given"
  | "consent_reminder"
  | "stopped"
  | "resumed"
  | "reply"
  | "urgent"
  | "stored"
  | "stop_clarify"
  | "left_group"
  | "stopped_all";

export type ContactRole = "primary" | "secondary";

const MAX_BODY = 4096;
/** Tâches qu'un clic du simulateur peut avancer. */
export const SIMULATED_KINDS = [
  "followup.message",
  REMINDER_KIND,
  END_KIND,
  SEND_JOB,
] as const;
export const MAX_VIEW_MESSAGES = 300;

export const ownerMessageInput = z
  .string()
  .trim()
  .min(1, "Écrivez un message.")
  .max(MAX_BODY, "Message trop long.");

export const contactRoleInput = z.enum(["primary", "secondary"]);

export const ownerLanguageInput = z.object({
  role: contactRoleInput,
  language: z.enum(["fr", "en"]),
});

export const uuid = z.uuid();

const sourceSteps = [
  "consent_given",
  "consent_reminder",
  "stopped",
  "resumed",
  "reply",
  "urgent",
  "deliver",
  "photo_received",
  "file_refused",
  "stop_clarify",
  "left_group",
  "stopped_all",
] as const;
export type SourceStep = (typeof sourceSteps)[number];

export const jobPayload = z.discriminatedUnion("step", [
  z.object({ step: z.literal("intro") }),
  // Fin du suivi automatisé (lot 15) : un message de clôture par fin.
  z.object({ step: z.literal("closing"), token: z.uuid() }),
  z.object({ step: z.enum(sourceSteps), messageId: z.uuid() }),
  // Décision du cabinet sur un rendez-vous proposé par Numa (lot 18).
  z.object({
    step: z.enum(["appointment_confirmed", "appointment_declined"]),
    appointmentId: z.uuid(),
  }),
]);

export type JobPayload = z.infer<typeof jobPayload>;

export const reminderPayload = z.object({ stepId: z.uuid() });

export type Contact = {
  id: string;
  role: ContactRole;
  ownerFullName: string;
  phone: string;
  language: "fr" | "en";
  languageSource: LanguageSource;
  leftGroupAt: Date | null;
  stopRequestedAt: Date | null;
};

export type Group = { id: string; externalRef: string };

export type ConversationContext = {
  followupId: string;
  organizationId: string;
  status: Status;
  isTest: boolean;
  animalId: string;
  animalName: string;
  practiceName: string;
  vetName: string;
  responsibleMembershipId: string;
  firstContactAt: Date | null;
  /** Contacts actifs, le principal d'abord. */
  contacts: Contact[];
  group: Group | null;
};

export type Target =
  | { kind: "direct"; contact: Contact }
  | { kind: "group"; group: Group; members: Contact[] };

/** Accords en cours de chaque contact ; `stopped` : arrêt du suivi entier demandé. */
export type Reach = { consents: Map<string, Consent>; stopped: boolean };

/** Suivi, cabinet, vétérinaire responsable, contacts actifs et groupe ouvert. */
export async function loadContext(
  tx: TenantTransaction,
  followupId: string,
  lock = false,
): Promise<ConversationContext> {
  if (lock)
    await tx
      .select({ id: followups.id })
      .from(followups)
      .where(eq(followups.id, followupId))
      .for("update");
  const [row] = await tx
    .select({
      followupId: followups.id,
      organizationId: followups.organizationId,
      status: followups.status,
      isTest: followups.isTest,
      firstContactAt: followups.firstContactAt,
      responsibleMembershipId: followups.responsibleMembershipId,
      animalId: followups.animalId,
      animalName: animals.name,
      practiceName: organizations.name,
      vetName: users.displayName,
    })
    .from(followups)
    .innerJoin(animals, eq(animals.id, followups.animalId))
    .innerJoin(organizations, eq(organizations.id, followups.organizationId))
    .innerJoin(
      memberships,
      eq(memberships.id, followups.responsibleMembershipId),
    )
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(followups.id, followupId));
  if (!row) throw new DomainError("not_found");
  const contacts = await tx
    .select({
      id: followupContacts.id,
      role: followupContacts.role,
      ownerFullName: owners.fullName,
      phone: ownerContacts.value,
      language: followupContacts.language,
      languageSource: followupContacts.languageSource,
      leftGroupAt: followupContacts.leftGroupAt,
      stopRequestedAt: followupContacts.stopRequestedAt,
    })
    .from(followupContacts)
    .innerJoin(owners, eq(owners.id, followupContacts.ownerId))
    .innerJoin(
      ownerContacts,
      eq(ownerContacts.id, followupContacts.ownerContactId),
    )
    .where(
      and(
        eq(followupContacts.followupId, followupId),
        eq(followupContacts.active, true),
      ),
    )
    .orderBy(asc(followupContacts.role));
  const [group] = await tx
    .select({
      id: conversationThreads.id,
      externalRef: conversationThreads.externalRef,
    })
    .from(conversationThreads)
    .where(
      and(
        eq(conversationThreads.followupId, followupId),
        eq(conversationThreads.kind, "group"),
        isNull(conversationThreads.closedAt),
      ),
    );
  return {
    ...row,
    contacts,
    group:
      group?.externalRef != null
        ? { id: group.id, externalRef: group.externalRef }
        : null,
  };
}

export function primaryOf(ctx: ConversationContext): Contact | null {
  return ctx.contacts.find((contact) => contact.role === "primary") ?? null;
}

export function otherOf(
  ctx: ConversationContext,
  contact: Contact,
): Contact | null {
  return ctx.contacts.find((other) => other.id !== contact.id) ?? null;
}

function names(contacts: readonly Contact[], language: "fr" | "en"): string {
  const first = contacts.map((contact) => firstName(contact.ownerFullName));
  if (first.length <= 1) return first[0] ?? "";
  return `${first.slice(0, -1).join(", ")} ${language === "en" ? "and" : "et"} ${first.at(-1)}`;
}

export function wordingFor(
  ctx: ConversationContext,
  target: Target,
  other?: Contact | null,
): WordingContext {
  if (target.kind === "group") {
    const language = target.members[0]?.language ?? "fr";
    return {
      language,
      ownerFirstName: names(target.members, language),
      animalName: ctx.animalName,
      practiceName: ctx.practiceName,
      vetName: ctx.vetName,
    };
  }
  const contact = target.contact;
  const counterpart = other === undefined ? otherOf(ctx, contact) : other;
  return {
    language: contact.language,
    ownerFirstName: firstName(contact.ownerFullName),
    animalName: ctx.animalName,
    practiceName: ctx.practiceName,
    vetName: ctx.vetName,
    otherFirstName: counterpart
      ? firstName(counterpart.ownerFullName)
      : undefined,
  };
}

export const direct = (contact: Contact): Target => ({
  kind: "direct",
  contact,
});

async function latestConsent(
  tx: TenantTransaction,
  contactId: string,
): Promise<Consent | null> {
  const [row] = await tx
    .select({ id: consents.id, state: consents.state, scope: consents.scope })
    .from(consents)
    .where(eq(consents.followupContactId, contactId))
    .orderBy(desc(consents.recordedAt))
    .limit(1);
  return row ?? null;
}

export async function reachOf(
  tx: TenantTransaction,
  ctx: ConversationContext,
): Promise<Reach> {
  const map = new Map<string, Consent>();
  for (const contact of ctx.contacts) {
    const consent = await latestConsent(tx, contact.id);
    if (consent) map.set(contact.id, consent);
  }
  const stopped = [...map.values()].some(
    (consent) => consent.state === "withdrawn" && consent.scope === "followup",
  );
  return { consents: map, stopped };
}

/** Peut-on écrire à ce contact ? Accord donné, pas de clarification, suivi non arrêté. */
export function mayReach(reach: Reach, contact: Contact): boolean {
  return (
    reach.consents.get(contact.id)?.state === "given" &&
    !contact.stopRequestedAt &&
    !reach.stopped
  );
}

export function groupMembers(ctx: ConversationContext): Contact[] {
  return ctx.group
    ? ctx.contacts.filter((contact) => !contact.leftGroupAt)
    : [];
}

/** Le groupe ne reçoit un message que si chacun de ses membres peut le recevoir. */
export function groupTarget(
  ctx: ConversationContext,
  reach: Reach,
): Target | null {
  const members = groupMembers(ctx);
  if (!ctx.group || members.length === 0) return null;
  if (!members.every((member) => mayReach(reach, member))) return null;
  return { kind: "group", group: ctx.group, members };
}

/**
 * Destinataires d'un message de suivi (rappel, clôture, message de l'équipe) : le groupe s'il
 * peut tout recevoir, sinon chaque propriétaire joignable, directement. Personne n'a quitté
 * le groupe pour recevoir encore ces messages.
 */
export function broadcastTargets(
  ctx: ConversationContext,
  reach: Reach,
): Target[] {
  if (reach.stopped) return [];
  const group = groupTarget(ctx, reach);
  if (group) return [group];
  return ctx.contacts
    .filter((contact) => mayReach(reach, contact) && !contact.leftGroupAt)
    .map(direct);
}

/** Réponse à un message : dans le groupe s'il y a été écrit et peut la recevoir, sinon en direct. */
export function replyTarget(
  ctx: ConversationContext,
  reach: Reach,
  writer: Contact,
  threadId: string,
): Target | null {
  if (!mayReach(reach, writer)) return null;
  if (ctx.group && threadId === ctx.group.id) {
    const group = groupTarget(ctx, reach);
    if (group) return group;
  }
  return direct(writer);
}

export const targetId = (target: Target) =>
  target.kind === "group" ? target.group.id : target.contact.id;

/**
 * Numa répond aux messages du propriétaire quand elle a la main : suivi actif, ou suivi
 * automatisé terminé à la date de contrôle (la conversation reste ouverte, cahier des
 * charges §5). Jamais en pause, reprise en main ou après un arrêt par le vétérinaire.
 */
export async function numaMayReply(
  tx: TenantTransaction,
  ctx: ConversationContext,
): Promise<boolean> {
  if (ctx.status === "active") return true;
  return (
    ctx.status === "ended" &&
    (await lastStatusReason(tx, ctx.followupId)) === AUTOMATIC_END_REASON
  );
}

export async function recordConsent(
  tx: TenantTransaction,
  ctx: ConversationContext,
  contactId: string,
  state: ConsentState,
  messageId: string,
  scope: "contact" | "followup" = "contact",
) {
  // Version du texte montré : celle du premier message envoyé à ce contact. À deux
  // propriétaires, il explique le groupe partagé, ou les conversations séparées (§6).
  const [intro] = await tx
    .select({ templateKey: messages.templateKey })
    .from(messages)
    .where(eq(messages.idempotencyKey, `intro:${contactId}`));
  const shown =
    intro?.templateKey && isTemplateKey(intro.templateKey)
      ? CONSENT_VERSION_OF[intro.templateKey]
      : undefined;
  const pair = ctx.contacts.length > 1;
  const wordingVersion =
    shown ?? (pair ? PAIR_CONSENT_WORDING_VERSION : CONSENT_WORDING_VERSION);
  await tx.insert(consents).values({
    organizationId: ctx.organizationId,
    followupId: ctx.followupId,
    followupContactId: contactId,
    state,
    scope,
    wordingVersion,
    groupExplained: wordingVersion === PAIR_CONSENT_WORDING_VERSION,
    messageId,
  });
}

/** Conversation directe avec le contact, créée au premier échange. */
export async function ensureThread(
  tx: TenantTransaction,
  ctx: ConversationContext,
  contactId: string,
): Promise<string> {
  await tx
    .insert(conversationThreads)
    .values({
      organizationId: ctx.organizationId,
      followupId: ctx.followupId,
      kind: "direct",
      followupContactId: contactId,
    })
    .onConflictDoNothing({
      target: [
        conversationThreads.followupId,
        conversationThreads.followupContactId,
      ],
    });
  const [thread] = await tx
    .select({ id: conversationThreads.id })
    .from(conversationThreads)
    .where(
      and(
        eq(conversationThreads.followupId, ctx.followupId),
        eq(conversationThreads.followupContactId, contactId),
      ),
    );
  if (!thread) throw new JobError("target_missing");
  return thread.id;
}

/** Texte d'origine d'une trace, gardé en français ; l'écran l'affiche par son code. */
const NOTE_BODY: Record<SystemNoteCode, (names: string[]) => string> = {
  group_created: (who) =>
    `Groupe WhatsApp du suivi créé avec ${frenchList(who)} (simulé).`,
  left_group: (who) => `${who[0] ?? ""} a quitté le groupe.`,
  group_emptied: (who) =>
    `${who[0] ?? ""} a quitté le groupe ; plus personne n'y reste, il est fermé.`,
  group_stopped: (who) =>
    `Groupe fermé : ${who[0] ?? ""} a demandé l'arrêt du suivi.`,
  file_refused: (who) =>
    `Fichier de ${who[0] ?? ""} non reçu : trop lourd ou format non pris en charge.`,
};

function frenchList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} et ${items.at(-1)}`;
}

/** Trace dans le groupe (création, départ, fermeture), visible de l'équipe. */
export async function systemNote(
  tx: TenantTransaction,
  ctx: ConversationContext,
  threadId: string,
  note: SystemNote,
) {
  await tx.insert(messages).values({
    organizationId: ctx.organizationId,
    followupId: ctx.followupId,
    threadId,
    direction: "internal",
    author: "system",
    body: NOTE_BODY[note.code](note.names),
    noteCode: note.code,
    noteNames: note.names,
    // Heure réelle (et non celle du début de la transaction) : l'ordre du fil est respecté.
    occurredAt: sql`clock_timestamp()`,
  });
}

export async function enqueueMessageJob(
  tx: TenantTransaction,
  ctx: ConversationContext,
  step: SourceStep,
  messageId: string,
  dedupe: string = messageId,
) {
  await enqueue(tx, {
    organizationId: ctx.organizationId,
    kind: "followup.message",
    idempotencyKey: `followup:${ctx.followupId}:${step}:${dedupe}`,
    runAt: new Date(),
    followupId: ctx.followupId,
    payload: { step, messageId },
  });
}
