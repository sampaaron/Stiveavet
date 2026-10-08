import { randomUUID } from "node:crypto";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  sql,
} from "drizzle-orm";
import { z } from "zod";

import type { AiGateway } from "@/adapters/ai-gateway/types";
import type { WhatsAppConnector } from "@/adapters/whatsapp/types";
import {
  appointmentKindFor,
  appointmentMinutes,
  findSlots,
  lockVetAgenda,
  slotStillFree,
} from "@/domains/agenda/demandes";
import {
  appointmentMessage,
  slotChoice,
  wantsAppointment,
} from "@/domains/agenda/rendez-vous";
import type { AppointmentWording } from "@/domains/agenda/rendez-vous";
import type { AuditMetadata } from "@/domains/audit/schema";
import { DomainError, assertPermission } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import { loadFollowup, setStatusReason } from "@/domains/suivis/lancement";
import { canResumeNuma, canWriteToOwner } from "@/domains/suivis/policies";
import {
  AUTOMATIC_END_REASON,
  END_KIND,
  REMINDER_KIND,
  lastStatusReason,
  scheduleReminders,
} from "@/domains/suivis/rappels";
import { JobError } from "@/domains/taches/kinds";
import {
  emergencyGuidance,
  triageOwnerMessage,
} from "@/domains/urgences/service";
import type { TriageLevel } from "@/domains/urgences/triage";
import { emit, enqueue } from "@/domains/taches/queue";
import type { JobHandler } from "@/domains/taches/worker";
import {
  animals,
  appointmentRequests,
  appointments,
  attachments,
  auditEvents,
  consents,
  conversationThreads,
  followupContacts,
  followupSteps,
  followups,
  memberships,
  messages,
  organizations,
  ownerContacts,
  owners,
  photoObservations,
  scheduledJobs,
  triageEvents,
  users,
  voiceTranscripts,
} from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import type { Database, TenantTransaction } from "@/server/db/tenant";

import { checkNumaReply, safeFallback } from "./guard";
import { ownerKeyword } from "./keywords";
import {
  CONSENT_WORDING_VERSION,
  PAIR_CONSENT_WORDING_VERSION,
  emergencyMessage,
  firstName,
  fixedMessage,
} from "./wording";
import type { FixedStep, WordingContext } from "./wording";

/**
 * Conversation WhatsApp d'un suivi (cahier des charges §3 à §6 et §8, ADR 0016 et 0021).
 * - Tout envoi passe par la file de tâches (`followup.message`) : clé d'idempotence par
 *   message, transmise au prestataire, donc jamais de doublon même si l'envoi est rejoué.
 * - Premier message au nom du cabinet et du vétérinaire responsable, Numa présentée comme IA ;
 *   aucun contenu clinique tant que le propriétaire n'a pas répondu OUI.
 * - STOP retire l'accord, REPRENDRE le recrée ; chaque état est une ligne de `consents`.
 * - Deux propriétaires (lot 18) : chacun accepte, le groupe est expliqué avant l'accord et créé
 *   dès que les deux ont accepté. Un STOP écrit dans le groupe ouvre une clarification :
 *   GROUPE (quitter le groupe seulement) ou TOUT (arrêter le suivi entier) ; rien n'est
 *   envoyé à cette personne en attendant.
 * - Un membre qui écrit au propriétaire met Numa en pause (reprise en main) jusqu'à
 *   « Reprendre Numa » par un vétérinaire.
 * - Les réponses de Numa viennent de la passerelle IA puis passent les garde-fous
 *   déterministes ; une réponse refusée est remplacée par un message sûr et journalisée.
 *   Une demande de rendez-vous reçoit des créneaux réels (jamais inventés par l'IA).
 * Ni contenu, ni numéro, ni nom n'entre dans le journal : seulement des identifiants et codes.
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
  delivery: "queued" | "sent" | "delivered" | "read" | "failed" | null;
  /** Niveau du triage d'un message du propriétaire, s'il a été évalué. */
  triage: TriageLevel | null;
  /** Photo ou message vocal joint (lot 16) ; le fichier se lit par un lien signé. */
  attachment: MessageAttachment | null;
  /** Conversation directe avec un propriétaire, ou groupe des deux (lot 18). */
  channel: "direct" | "group";
  /** Prénom du propriétaire auteur (entrant) ou destinataire (sortant direct). */
  contactName: string | null;
  contactRole: ContactRole | null;
};

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
};

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
  /** Destinataires d'un message écrit maintenant (« Julien et Sophie »), ou null. */
  recipients: string | null;
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
const SIMULATED_KINDS = ["followup.message", REMINDER_KIND, END_KIND] as const;
const MAX_VIEW_MESSAGES = 300;

export const ownerMessageInput = z
  .string()
  .trim()
  .min(1, "Écrivez un message.")
  .max(MAX_BODY, "Message trop long.");

export const contactRoleInput = z.enum(["primary", "secondary"]);

const uuid = z.uuid();

const sourceSteps = [
  "consent_given",
  "consent_reminder",
  "stopped",
  "resumed",
  "reply",
  "urgent",
  "deliver",
  "photo_received",
  "stop_clarify",
  "left_group",
  "stopped_all",
] as const;
type SourceStep = (typeof sourceSteps)[number];

const jobPayload = z.discriminatedUnion("step", [
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

const reminderPayload = z.object({ stepId: z.uuid() });

type Contact = {
  id: string;
  role: ContactRole;
  ownerFullName: string;
  phone: string;
  language: "fr" | "en";
  leftGroupAt: Date | null;
  stopRequestedAt: Date | null;
};

type Group = { id: string; externalRef: string };

type ConversationContext = {
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

type Target =
  | { kind: "direct"; contact: Contact }
  | { kind: "group"; group: Group; members: Contact[] };

/** Accords en cours de chaque contact ; `stopped` : arrêt du suivi entier demandé. */
type Reach = { consents: Map<string, Consent>; stopped: boolean };

/** Suivi, cabinet, vétérinaire responsable, contacts actifs et groupe ouvert. */
async function loadContext(
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

function primaryOf(ctx: ConversationContext): Contact | null {
  return ctx.contacts.find((contact) => contact.role === "primary") ?? null;
}

function otherOf(ctx: ConversationContext, contact: Contact): Contact | null {
  return ctx.contacts.find((other) => other.id !== contact.id) ?? null;
}

function names(contacts: readonly Contact[], language: "fr" | "en"): string {
  const first = contacts.map((contact) => firstName(contact.ownerFullName));
  if (first.length <= 1) return first[0] ?? "";
  return `${first.slice(0, -1).join(", ")} ${language === "en" ? "and" : "et"} ${first.at(-1)}`;
}

function wordingFor(
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

const direct = (contact: Contact): Target => ({ kind: "direct", contact });

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

async function reachOf(
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
function mayReach(reach: Reach, contact: Contact): boolean {
  return (
    reach.consents.get(contact.id)?.state === "given" &&
    !contact.stopRequestedAt &&
    !reach.stopped
  );
}

function groupMembers(ctx: ConversationContext): Contact[] {
  return ctx.group
    ? ctx.contacts.filter((contact) => !contact.leftGroupAt)
    : [];
}

/** Le groupe ne reçoit un message que si chacun de ses membres peut le recevoir. */
function groupTarget(ctx: ConversationContext, reach: Reach): Target | null {
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
function broadcastTargets(ctx: ConversationContext, reach: Reach): Target[] {
  if (reach.stopped) return [];
  const group = groupTarget(ctx, reach);
  if (group) return [group];
  return ctx.contacts
    .filter((contact) => mayReach(reach, contact) && !contact.leftGroupAt)
    .map(direct);
}

/** Réponse à un message : dans le groupe s'il y a été écrit et peut la recevoir, sinon en direct. */
function replyTarget(
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

const targetId = (target: Target) =>
  target.kind === "group" ? target.group.id : target.contact.id;

/**
 * Numa répond aux messages du propriétaire quand elle a la main : suivi actif, ou suivi
 * automatisé terminé à la date de contrôle (la conversation reste ouverte, cahier des
 * charges §5). Jamais en pause, reprise en main ou après un arrêt par le vétérinaire.
 */
async function numaMayReply(
  tx: TenantTransaction,
  ctx: ConversationContext,
): Promise<boolean> {
  if (ctx.status === "active") return true;
  return (
    ctx.status === "ended" &&
    (await lastStatusReason(tx, ctx.followupId)) === AUTOMATIC_END_REASON
  );
}

async function recordConsent(
  tx: TenantTransaction,
  ctx: ConversationContext,
  contactId: string,
  state: ConsentState,
  messageId: string,
  scope: "contact" | "followup" = "contact",
) {
  // À deux propriétaires, le texte montré explique le groupe partagé (§6).
  const pair = ctx.contacts.length > 1;
  await tx.insert(consents).values({
    organizationId: ctx.organizationId,
    followupId: ctx.followupId,
    followupContactId: contactId,
    state,
    scope,
    wordingVersion: pair
      ? PAIR_CONSENT_WORDING_VERSION
      : CONSENT_WORDING_VERSION,
    groupExplained: pair,
    messageId,
  });
}

/** Conversation directe avec le contact, créée au premier échange. */
async function ensureThread(
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

/** Trace dans le groupe (création, départ, fermeture), visible de l'équipe. */
async function systemNote(
  tx: TenantTransaction,
  ctx: ConversationContext,
  threadId: string,
  body: string,
) {
  await tx.insert(messages).values({
    organizationId: ctx.organizationId,
    followupId: ctx.followupId,
    threadId,
    direction: "internal",
    author: "system",
    body,
    // Heure réelle (et non celle du début de la transaction) : l'ordre du fil est respecté.
    occurredAt: sql`clock_timestamp()`,
  });
}

async function enqueueMessageJob(
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

/**
 * Tâches `followup.message` : premier message, accusés de consentement, relance d'accord,
 * groupe, réponses de Numa, rendez-vous et envoi des messages écrits par l'équipe. Chaque cas
 * revérifie l'état au moment de l'envoi (pause, reprise en main, retrait d'accord, STOP dans
 * le groupe) : rien ne part à tort.
 */
export function conversationHandlers(deps: {
  whatsapp: WhatsAppConnector;
  ai: AiGateway;
}): Record<string, JobHandler> {
  const { whatsapp, ai } = deps;

  async function deliver(
    tx: TenantTransaction,
    message: { id: string; body: string; idempotencyKey: string },
    target: Target,
  ) {
    let externalRef: string;
    try {
      ({ externalRef } =
        target.kind === "group"
          ? await whatsapp.sendGroupMessage({
              groupRef: target.group.externalRef,
              body: message.body,
              idempotencyKey: message.idempotencyKey,
            })
          : await whatsapp.sendMessage({
              to: target.contact.phone,
              body: message.body,
              idempotencyKey: message.idempotencyKey,
            }));
    } catch {
      throw new JobError("provider_unavailable");
    }
    await tx
      .update(messages)
      .set({ deliveryStatus: "sent", sentAt: new Date(), externalRef })
      .where(eq(messages.id, message.id));
  }

  /** Message de Numa : créé une seule fois par clé, envoyé tant qu'il est en attente. */
  async function sendNuma(
    tx: TenantTransaction,
    ctx: ConversationContext,
    target: Target,
    key: string,
    body: string,
  ): Promise<string> {
    const threadId =
      target.kind === "group"
        ? target.group.id
        : await ensureThread(tx, ctx, target.contact.id);
    const language =
      target.kind === "group"
        ? (target.members[0]?.language ?? "fr")
        : target.contact.language;
    await tx
      .insert(messages)
      .values({
        organizationId: ctx.organizationId,
        followupId: ctx.followupId,
        threadId,
        direction: "outbound",
        author: "numa",
        followupContactId: target.kind === "direct" ? target.contact.id : null,
        body,
        language,
        deliveryStatus: "queued",
        idempotencyKey: key,
        occurredAt: sql`clock_timestamp()`,
      })
      .onConflictDoNothing({
        target: [messages.organizationId, messages.idempotencyKey],
      });
    const [message] = await tx
      .select({
        id: messages.id,
        body: messages.body,
        deliveryStatus: messages.deliveryStatus,
      })
      .from(messages)
      .where(eq(messages.idempotencyKey, key));
    if (!message) throw new JobError("target_missing");
    if (message.deliveryStatus === "queued")
      await deliver(
        tx,
        { id: message.id, body: message.body, idempotencyKey: key },
        target,
      );
    return message.id;
  }

  /** Même message (rédigé pour chacun) à plusieurs destinataires, une clé par destinataire. */
  async function sendEach(
    tx: TenantTransaction,
    ctx: ConversationContext,
    targets: readonly Target[],
    key: string,
    bodyOf: (target: Target) => string,
  ) {
    for (const target of targets)
      await sendNuma(
        tx,
        ctx,
        target,
        targets.length === 1 ? key : `${key}:${targetId(target)}`,
        bodyOf(target),
      );
  }

  /** Groupe dédié au suivi, créé par l'API professionnelle (simulée) dès les deux accords. */
  async function createGroup(
    tx: TenantTransaction,
    ctx: ConversationContext,
    members: Contact[],
  ): Promise<Target> {
    const [existing] = await tx
      .select({ n: count() })
      .from(conversationThreads)
      .where(
        and(
          eq(conversationThreads.followupId, ctx.followupId),
          eq(conversationThreads.kind, "group"),
        ),
      );
    let groupRef: string;
    try {
      ({ groupRef } = await whatsapp.createGroup({
        name: `${ctx.animalName} · ${ctx.practiceName}`.slice(0, 100),
        members: members.map((member) => member.phone),
        idempotencyKey: `group:${ctx.followupId}:${(existing?.n ?? 0) + 1}`,
      }));
    } catch {
      throw new JobError("provider_unavailable");
    }
    const [thread] = await tx
      .insert(conversationThreads)
      .values({
        organizationId: ctx.organizationId,
        followupId: ctx.followupId,
        kind: "group",
        externalRef: groupRef,
      })
      .returning({ id: conversationThreads.id });
    if (!thread) throw new Error("Groupe non enregistré");
    const group = { id: thread.id, externalRef: groupRef };
    await systemNote(
      tx,
      ctx,
      group.id,
      `Groupe WhatsApp du suivi créé avec ${names(members, "fr")} (simulé).`,
    );
    await auditSystem(
      tx,
      ctx.organizationId,
      "conversation.group_created",
      ctx.followupId,
      { members: members.length },
    );
    return { kind: "group", group, members };
  }

  async function closeGroup(
    tx: TenantTransaction,
    ctx: ConversationContext,
    group: Group,
    note: string,
  ) {
    try {
      await whatsapp.closeGroup({
        groupRef: group.externalRef,
        idempotencyKey: `group-close:${group.id}`,
      });
    } catch {
      throw new JobError("provider_unavailable");
    }
    await tx
      .update(conversationThreads)
      .set({ closedAt: new Date() })
      .where(eq(conversationThreads.id, group.id));
    await systemNote(tx, ctx, group.id, note);
  }

  async function inbound(tx: TenantTransaction, messageId: string) {
    const [message] = await tx
      .select({
        id: messages.id,
        followupId: messages.followupId,
        threadId: messages.threadId,
        body: messages.body,
        author: messages.author,
        followupContactId: messages.followupContactId,
      })
      .from(messages)
      .where(eq(messages.id, messageId));
    if (!message || message.author !== "owner")
      throw new JobError("target_missing");
    if (message.body.length > 0) return message;
    // Message vocal (lot 16) : Numa répond à sa transcription.
    const [transcript] = await tx
      .select({ text: voiceTranscripts.text })
      .from(voiceTranscripts)
      .innerJoin(attachments, eq(attachments.id, voiceTranscripts.attachmentId))
      .where(eq(attachments.messageId, message.id))
      .limit(1);
    return transcript ? { ...message, body: transcript.text } : message;
  }

  function appointmentWording(
    ctx: ConversationContext,
    target: Target,
  ): AppointmentWording {
    const wording = wordingFor(ctx, target);
    return {
      language: wording.language,
      ownerFirstName: wording.ownerFirstName,
      animalName: ctx.animalName,
      practiceName: ctx.practiceName,
      vetName: ctx.vetName,
    };
  }

  /**
   * Demande de rendez-vous : jusqu'à trois créneaux libres du vétérinaire responsable, dans
   * les plages approuvées ; sinon le cabinet rappelle. Jamais un autre vétérinaire (§8).
   */
  async function offerSlots(
    tx: TenantTransaction,
    ctx: ConversationContext,
    target: Target,
    writer: Contact,
    source: { id: string; threadId: string },
    key: string,
  ) {
    const now = new Date();
    // Une seule proposition ouverte par conversation : la nouvelle remplace l'ancienne.
    await tx
      .update(appointmentRequests)
      .set({ status: "closed", closedAt: now })
      .where(
        and(
          eq(appointmentRequests.threadId, source.threadId),
          eq(appointmentRequests.status, "offered"),
        ),
      );
    const kind = await appointmentKindFor(tx, ctx.followupId);
    const minutes = await appointmentMinutes(tx, kind);
    // Deux propriétaires (ou deux suivis) ne se voient jamais proposer le même créneau.
    await lockVetAgenda(tx, ctx.responsibleMembershipId);
    const slots = await findSlots(tx, {
      membershipId: ctx.responsibleMembershipId,
      minutes,
      now,
    });
    await tx.insert(appointmentRequests).values({
      organizationId: ctx.organizationId,
      followupId: ctx.followupId,
      followupContactId: writer.id,
      threadId: source.threadId,
      requestMessageId: source.id,
      membershipId: ctx.responsibleMembershipId,
      kind,
      minutes,
      slotStarts: slots,
      status: slots.length > 0 ? "offered" : "callback",
    });
    await sendNuma(
      tx,
      ctx,
      target,
      key,
      appointmentMessage(
        slots.length > 0 ? { kind: "offer", slots } : { kind: "callback" },
        appointmentWording(ctx, target),
      ),
    );
    await auditSystem(
      tx,
      ctx.organizationId,
      "appointment.requested",
      ctx.followupId,
      { slots: slots.length, kind },
    );
  }

  /** Choix d'un créneau proposé : rendez-vous « proposé », que le cabinet confirmera. */
  async function chooseSlot(
    tx: TenantTransaction,
    ctx: ConversationContext,
    target: Target,
    writer: Contact,
    source: { id: string; threadId: string },
    request: {
      id: string;
      slotStarts: Date[];
      minutes: number;
      membershipId: string;
      kind: "post_op_control" | "emergency" | "treatment_followup" | "other";
    },
    choice: number,
    key: string,
  ) {
    const now = new Date();
    const startsAt = request.slotStarts[choice - 1];
    const free =
      startsAt !== undefined &&
      request.membershipId === ctx.responsibleMembershipId &&
      (await slotStillFree(tx, {
        membershipId: request.membershipId,
        startsAt,
        minutes: request.minutes,
        requestId: request.id,
        now,
      }));
    if (!startsAt || !free) {
      await tx
        .update(appointmentRequests)
        .set({ status: "closed", closedAt: now })
        .where(eq(appointmentRequests.id, request.id));
      await sendNuma(
        tx,
        ctx,
        target,
        `${key}:unavailable`,
        appointmentMessage(
          { kind: "unavailable" },
          appointmentWording(ctx, target),
        ),
      );
      await offerSlots(tx, ctx, target, writer, source, key);
      return;
    }
    const [appointment] = await tx
      .insert(appointments)
      .values({
        organizationId: ctx.organizationId,
        followupId: ctx.followupId,
        animalId: ctx.animalId,
        membershipId: request.membershipId,
        kind: request.kind,
        status: "proposed",
        source: "numa",
        startsAt,
        endsAt: new Date(startsAt.getTime() + request.minutes * 60_000),
      })
      .returning({ id: appointments.id });
    if (!appointment) throw new Error("Rendez-vous non enregistré");
    await tx
      .update(appointmentRequests)
      .set({ status: "chosen", appointmentId: appointment.id })
      .where(eq(appointmentRequests.id, request.id));
    await sendNuma(
      tx,
      ctx,
      target,
      key,
      appointmentMessage(
        { kind: "chosen", at: startsAt },
        appointmentWording(ctx, target),
      ),
    );
    await auditSystem(
      tx,
      ctx.organizationId,
      "appointment.proposed",
      ctx.followupId,
      { appointmentId: appointment.id },
    );
  }

  /** Réponse de Numa : choix d'un créneau, demande de rendez-vous, ou réponse de l'IA. */
  async function respond(
    tx: TenantTransaction,
    ctx: ConversationContext,
    target: Target,
    writer: Contact,
    source: { id: string; threadId: string; body: string },
  ) {
    const key = `reply:${source.id}`;
    const choice = slotChoice(source.body);
    if (choice !== null) {
      const [request] = await tx
        .select({
          id: appointmentRequests.id,
          slotStarts: appointmentRequests.slotStarts,
          minutes: appointmentRequests.minutes,
          membershipId: appointmentRequests.membershipId,
          kind: appointmentRequests.kind,
        })
        .from(appointmentRequests)
        .where(
          and(
            eq(appointmentRequests.threadId, source.threadId),
            eq(appointmentRequests.status, "offered"),
            gt(appointmentRequests.expiresAt, new Date()),
          ),
        )
        .orderBy(desc(appointmentRequests.createdAt))
        .limit(1)
        .for("update");
      if (request)
        return chooseSlot(
          tx,
          ctx,
          target,
          writer,
          source,
          request,
          choice,
          key,
        );
    }
    if (wantsAppointment(source.body))
      return offerSlots(tx, ctx, target, writer, source, key);
    await aiReply(tx, ctx, target, source, key);
  }

  /** Réponse de Numa par la passerelle IA, filtrée par les garde-fous. */
  async function aiReply(
    tx: TenantTransaction,
    ctx: ConversationContext,
    target: Target,
    source: { id: string; body: string },
    key: string,
  ) {
    const { language } = wordingFor(ctx, target);
    let text: string;
    try {
      ({ text } = await ai.numaReply({
        language,
        animalName: ctx.animalName,
        practiceName: ctx.practiceName,
        ownerMessage: source.body,
      }));
    } catch {
      throw new JobError("provider_unavailable");
    }
    const verdict = checkNumaReply(text);
    if (!verdict.ok)
      await auditSystem(
        tx,
        ctx.organizationId,
        "numa.reply_blocked",
        ctx.followupId,
        { reason: verdict.reason },
      );
    const body = verdict.ok ? text : safeFallback(language, ctx.practiceName);
    await sendNuma(tx, ctx, target, key, body);
  }

  /** Après un accord (OUI ou REPRENDRE) : groupe si les deux ont accepté, sinon accusé direct. */
  async function afterConsent(
    tx: TenantTransaction,
    ctx: ConversationContext,
    reach: Reach,
    writer: Contact,
    step: "consent_given" | "resumed",
    key: string,
  ) {
    if (!mayReach(reach, writer)) return;
    const other = otherOf(ctx, writer);
    if (
      other &&
      !ctx.group &&
      mayReach(reach, other) &&
      !writer.leftGroupAt &&
      !other.leftGroupAt
    ) {
      const group = await createGroup(tx, ctx, [
        ...ctx.contacts.filter((contact) => !contact.leftGroupAt),
      ]);
      await sendNuma(
        tx,
        ctx,
        group,
        `group_welcome:${group.kind === "group" ? group.group.id : key}`,
        fixedMessage("group_welcome", wordingFor(ctx, group)),
      );
      return;
    }
    const waiting =
      step === "consent_given" &&
      other !== null &&
      !ctx.group &&
      reach.consents.get(other.id)?.state !== "given";
    await sendNuma(
      tx,
      ctx,
      direct(writer),
      key,
      fixedMessage(
        waiting ? "consent_given_waiting" : step,
        wordingFor(ctx, direct(writer)),
      ),
    );
  }

  /** Décision du cabinet sur un rendez-vous : Numa prévient là où la demande a été faite. */
  async function appointmentDecision(
    tx: TenantTransaction,
    ctx: ConversationContext,
    reach: Reach,
    step: "appointment_confirmed" | "appointment_declined",
    appointmentId: string,
  ) {
    const [row] = await tx
      .select({
        startsAt: appointments.startsAt,
        status: appointments.status,
        threadId: appointmentRequests.threadId,
        contactId: appointmentRequests.followupContactId,
      })
      .from(appointments)
      .innerJoin(
        appointmentRequests,
        eq(appointmentRequests.appointmentId, appointments.id),
      )
      .where(
        and(
          eq(appointments.id, appointmentId),
          eq(appointments.followupId, ctx.followupId),
        ),
      );
    if (!row) throw new JobError("target_missing");
    // Décision changée entre-temps : le message correspondant partira de sa propre tâche.
    if (
      (step === "appointment_confirmed" && row.status !== "confirmed") ||
      (step === "appointment_declined" && row.status !== "cancelled")
    )
      return;
    const writer = ctx.contacts.find((contact) => contact.id === row.contactId);
    if (!writer) return;
    const target = replyTarget(ctx, reach, writer, row.threadId);
    if (!target) return;
    await sendNuma(
      tx,
      ctx,
      target,
      `${step}:${appointmentId}`,
      appointmentMessage(
        step === "appointment_confirmed"
          ? { kind: "confirmed", at: row.startsAt }
          : { kind: "declined", at: row.startsAt },
        appointmentWording(ctx, target),
      ),
    );
  }

  const handler: JobHandler = async ({ tx, job }) => {
    const parsed = jobPayload.safeParse(job.payload);
    if (!parsed.success) throw new JobError("invalid_payload");
    const payload = parsed.data;
    if (!job.followupId) throw new JobError("target_missing");
    const ctx = await loadContext(tx, job.followupId, true).catch(
      (error: unknown) => {
        if (error instanceof DomainError) throw new JobError("target_missing");
        throw error;
      },
    );
    // Un suivi test n'envoie jamais rien.
    if (ctx.isTest) return;
    if (ctx.contacts.length === 0) throw new JobError("target_missing");
    const reach = await reachOf(tx, ctx);

    if (payload.step === "intro") {
      // En pause, repris en main ou arrêté : la reprise du suivi replanifie ce message.
      if (ctx.status !== "active") return;
      const pair = ctx.contacts.length > 1;
      for (const contact of ctx.contacts) {
        if (reach.consents.has(contact.id)) continue;
        const id = await sendNuma(
          tx,
          ctx,
          direct(contact),
          `intro:${contact.id}`,
          fixedMessage(
            pair ? "intro_pair" : "intro",
            wordingFor(ctx, direct(contact)),
          ),
        );
        // La demande d'accord porte la référence du premier message, qui en contient le texte.
        await recordConsent(tx, ctx, contact.id, "requested", id);
      }
      return;
    }

    if (payload.step === "closing") {
      // Réactivé entre-temps, ou accord retiré : pas de message de clôture.
      if (ctx.status !== "ended") return;
      await sendEach(
        tx,
        ctx,
        broadcastTargets(ctx, reach),
        `closing:${payload.token}`,
        (target) => fixedMessage("closing", wordingFor(ctx, target)),
      );
      return;
    }

    if ("appointmentId" in payload) {
      await appointmentDecision(
        tx,
        ctx,
        reach,
        payload.step,
        payload.appointmentId,
      );
      return;
    }

    if (payload.step === "deliver") {
      const [message] = await tx
        .select({
          id: messages.id,
          author: messages.author,
          body: messages.body,
          threadId: messages.threadId,
          contactId: messages.followupContactId,
          deliveryStatus: messages.deliveryStatus,
          idempotencyKey: messages.idempotencyKey,
        })
        .from(messages)
        .where(
          and(
            eq(messages.id, payload.messageId),
            eq(messages.followupId, ctx.followupId),
          ),
        );
      if (!message || message.author !== "vet" || !message.idempotencyKey)
        throw new JobError("target_missing");
      if (message.deliveryStatus !== "queued") return;
      const contact = ctx.contacts.find((c) => c.id === message.contactId);
      const target =
        ctx.group && message.threadId === ctx.group.id
          ? groupTarget(ctx, reach)
          : contact && mayReach(reach, contact)
            ? direct(contact)
            : null;
      if (!target) {
        // Accord retiré (ou STOP dans le groupe) entre l'écriture et l'envoi : rien ne part.
        await tx
          .update(messages)
          .set({
            deliveryStatus: "failed",
            failedAt: new Date(),
            errorCode: "consent_withdrawn",
          })
          .where(eq(messages.id, message.id));
        return;
      }
      await deliver(
        tx,
        {
          id: message.id,
          body: message.body,
          idempotencyKey: message.idempotencyKey,
        },
        target,
      );
      return;
    }

    const source = await inbound(tx, payload.messageId);
    if (source.followupId !== ctx.followupId)
      throw new JobError("target_missing");
    const writer = ctx.contacts.find(
      (contact) => contact.id === source.followupContactId,
    );
    if (!writer) throw new JobError("target_missing");
    const key = `${payload.step}:${source.id}`;
    const consent = reach.consents.get(writer.id);

    switch (payload.step) {
      case "urgent": {
        // Après un STOP, rien ne part ; l'équipe a déjà été alertée.
        if (consent?.state === "withdrawn") return;
        const guidance = await emergencyGuidance(tx);
        // Dans le groupe s'il y a été écrit (chacun voit les consignes), sinon à la personne.
        const target =
          (ctx.group && source.threadId === ctx.group.id
            ? groupTarget(ctx, reach)
            : null) ?? direct(writer);
        const wording = wordingFor(ctx, target);
        await sendNuma(
          tx,
          ctx,
          target,
          key,
          emergencyMessage({
            ...guidance,
            language: wording.language,
            ownerFirstName: wording.ownerFirstName,
            animalName: ctx.animalName,
            practiceName: ctx.practiceName,
          }),
        );
        // Puis Numa poursuit la discussion, si elle a la main et l'accord du propriétaire.
        const reply = replyTarget(ctx, reach, writer, source.threadId);
        if (reply && (await numaMayReply(tx, ctx)))
          await respond(tx, ctx, reply, writer, source);
        return;
      }
      case "reply":
      case "photo_received": {
        // Reprise en main, pause, arrêt ou accord retiré depuis l'arrivée du message.
        const target = replyTarget(ctx, reach, writer, source.threadId);
        if (!target || !(await numaMayReply(tx, ctx))) return;
        if (payload.step === "reply")
          await respond(tx, ctx, target, writer, source);
        else
          await sendNuma(
            tx,
            ctx,
            target,
            key,
            fixedMessage("photo_received", wordingFor(ctx, target)),
          );
        return;
      }
      case "consent_given":
      case "resumed":
        await afterConsent(tx, ctx, reach, writer, payload.step, key);
        return;
      case "consent_reminder":
        if (consent?.state !== "requested") return;
        break;
      case "stop_clarify":
        // Réponse déjà donnée entre-temps : la question ne part plus.
        if (!writer.stopRequestedAt) return;
        break;
      case "left_group": {
        if (ctx.group) {
          try {
            await whatsapp.removeFromGroup({
              groupRef: ctx.group.externalRef,
              member: writer.phone,
              idempotencyKey: `group-leave:${ctx.group.id}:${writer.id}`,
            });
          } catch {
            throw new JobError("provider_unavailable");
          }
          const leaver = firstName(writer.ownerFullName);
          if (groupMembers(ctx).length === 0)
            await closeGroup(
              tx,
              ctx,
              ctx.group,
              `${leaver} a quitté le groupe ; plus personne n'y reste, il est fermé.`,
            );
          else
            await systemNote(
              tx,
              ctx,
              ctx.group.id,
              `${leaver} a quitté le groupe.`,
            );
        }
        break;
      }
      case "stopped_all": {
        if (ctx.group)
          await closeGroup(
            tx,
            ctx,
            ctx.group,
            `Groupe fermé : ${firstName(writer.ownerFullName)} a demandé l'arrêt du suivi.`,
          );
        // L'autre propriétaire est prévenu, s'il avait accepté le suivi.
        for (const other of ctx.contacts)
          if (
            other.id !== writer.id &&
            reach.consents.get(other.id)?.state === "given" &&
            !other.stopRequestedAt
          )
            await sendNuma(
              tx,
              ctx,
              direct(other),
              `${key}:${other.id}`,
              fixedMessage(
                "stopped_by_other",
                wordingFor(ctx, direct(other), writer),
              ),
            );
        break;
      }
      case "stopped":
        break;
    }
    const step: FixedStep = payload.step;
    await sendNuma(
      tx,
      ctx,
      direct(writer),
      key,
      fixedMessage(step, wordingFor(ctx, direct(writer))),
    );
  };

  /**
   * Étape programmée de la fiche (`followup.reminder`, lot 15) : rédigée par Numa d'après la
   * consigne validée par le vétérinaire, filtrée par les garde-fous. Elle ne part que si le
   * suivi est actif, l'accord donné et l'étape toujours dans la fiche ; au groupe s'il existe.
   */
  const reminder: JobHandler = async ({ tx, job }) => {
    const parsed = reminderPayload.safeParse(job.payload);
    if (!parsed.success) throw new JobError("invalid_payload");
    if (!job.followupId) throw new JobError("target_missing");
    const ctx = await loadContext(tx, job.followupId, true).catch(
      (error: unknown) => {
        if (error instanceof DomainError) throw new JobError("target_missing");
        throw error;
      },
    );
    if (ctx.isTest) return;
    if (ctx.contacts.length === 0) throw new JobError("target_missing");
    // En pause, repris en main ou terminé : l'étape ne part pas, et ne repartira pas.
    if (ctx.status !== "active") return;
    const targets = broadcastTargets(ctx, await reachOf(tx, ctx));
    if (targets.length === 0) return;
    const [step] = await tx
      .select({
        id: followupSteps.id,
        kind: followupSteps.kind,
        content: followupSteps.content,
        supersededAt: followupSteps.supersededAt,
        controlAppointmentAt: followups.controlAppointmentAt,
      })
      .from(followupSteps)
      .innerJoin(followups, eq(followups.id, followupSteps.followupId))
      .where(
        and(
          eq(followupSteps.id, parsed.data.stepId),
          eq(followupSteps.followupId, ctx.followupId),
        ),
      );
    if (!step) throw new JobError("target_missing");
    // Étape remplacée par une modification de la fiche : la nouvelle a sa propre tâche.
    if (step.supersededAt) return;
    const drafts = new Map<string, string>();
    for (const target of targets) {
      const wording = wordingFor(ctx, target);
      if (drafts.has(wording.language)) continue;
      let text: string;
      try {
        ({ text } = await ai.numaStep({
          language: wording.language,
          animalName: ctx.animalName,
          practiceName: ctx.practiceName,
          kind: step.kind,
          instruction: step.content,
          controlAppointmentAt: step.controlAppointmentAt,
        }));
      } catch {
        throw new JobError("provider_unavailable");
      }
      const verdict = checkNumaReply(text);
      if (!verdict.ok)
        await auditSystem(
          tx,
          ctx.organizationId,
          "numa.reply_blocked",
          ctx.followupId,
          { reason: verdict.reason },
        );
      drafts.set(
        wording.language,
        verdict.ok ? text : fixedMessage("check_in", wording),
      );
    }
    await sendEach(
      tx,
      ctx,
      targets,
      `step:${step.id}`,
      (target) => drafts.get(wordingFor(ctx, target).language) ?? "",
    );
  };

  return { "followup.message": handler, [REMINDER_KIND]: reminder };
}

/**
 * Message du propriétaire, reçu par WhatsApp (simulé en phase 2) : toujours conservé, avec
 * ou sans pièce jointe, dans le groupe si la personne en est membre, sinon en direct. Ce
 * qu'il déclenche est décidé par `processInbound`.
 */
export async function recordInbound(
  tx: TenantTransaction,
  followupId: string,
  body: string,
  from: ContactRole = "primary",
): Promise<{
  messageId: string;
  organizationId: string;
  language: "fr" | "en";
}> {
  const ctx = await loadContext(tx, followupId, true);
  if (ctx.status === "draft" || ctx.isTest)
    throw new DomainError("invalid_transition");
  const contact = ctx.contacts.find((c) => c.role === from);
  if (!contact) throw new DomainError("not_found");
  // En clarification après un STOP, la personne échange en privé avec Numa.
  const threadId =
    ctx.group && !contact.leftGroupAt && !contact.stopRequestedAt
      ? ctx.group.id
      : await ensureThread(tx, ctx, contact.id);
  const [message] = await tx
    .insert(messages)
    .values({
      organizationId: ctx.organizationId,
      followupId,
      threadId,
      direction: "inbound",
      author: "owner",
      followupContactId: contact.id,
      body,
      language: contact.language,
    })
    .returning({ id: messages.id });
  if (!message) throw new Error("Message non enregistré");
  await emit(tx, {
    organizationId: ctx.organizationId,
    topic: "message.received",
    aggregateType: "message",
    aggregateId: message.id,
  });
  return {
    messageId: message.id,
    organizationId: ctx.organizationId,
    language: contact.language,
  };
}

/**
 * Accord en cours d'un contact (le principal par défaut) : l'analyse photo n'a lieu
 * qu'après l'accord de la personne qui l'a envoyée (lot 16). Un arrêt du suivi entier vaut
 * retrait pour tous.
 */
export async function currentConsentState(
  tx: TenantTransaction,
  followupId: string,
  contactId?: string | null,
): Promise<ConsentState | null> {
  const ctx = await loadContext(tx, followupId);
  const contact = contactId
    ? ctx.contacts.find((c) => c.id === contactId)
    : primaryOf(ctx);
  if (!contact) return null;
  const reach = await reachOf(tx, ctx);
  if (reach.stopped) return "withdrawn";
  return reach.consents.get(contact.id)?.state ?? null;
}

/**
 * Ce que déclenche le contenu d'un message du propriétaire : son texte, la légende d'une
 * photo ou la transcription d'un vocal (lot 16). L'accord en cours, la clarification après un
 * STOP dans le groupe, le triage et l'état du suivi décident ; l'appelant tient déjà le
 * verrou du suivi.
 */
export async function processInbound(
  tx: TenantTransaction,
  followupId: string,
  messageId: string,
  text: string,
  options: { photo?: boolean } = {},
): Promise<{ outcome: InboundOutcome; triage: TriageLevel }> {
  const ctx = await loadContext(tx, followupId, true);
  const [source] = await tx
    .select({ contactId: messages.followupContactId })
    .from(messages)
    .where(
      and(eq(messages.id, messageId), eq(messages.followupId, followupId)),
    );
  const writer = ctx.contacts.find((c) => c.id === source?.contactId);
  if (!writer) throw new DomainError("not_found");
  const reach = await reachOf(tx, ctx);
  const consent = reach.consents.get(writer.id) ?? null;
  const keyword = ownerKeyword(text);
  const now = new Date();

  const setContact = (values: {
    leftGroupAt?: Date;
    stopRequestedAt: Date | null;
  }) =>
    tx
      .update(followupContacts)
      .set(values)
      .where(eq(followupContacts.id, writer.id));

  // Clarification après un STOP dans le groupe (§6) : GROUPE, TOUT, ou REPRENDRE.
  if (writer.stopRequestedAt) {
    if (keyword === "leave_group") {
      await setContact({ leftGroupAt: now, stopRequestedAt: null });
      await enqueueMessageJob(tx, ctx, "left_group", messageId);
      await auditSystem(
        tx,
        ctx.organizationId,
        "conversation.left_group",
        followupId,
      );
      return { outcome: "left_group", triage: "normal" };
    }
    if (keyword === "stop_all" || keyword === "stop") {
      await setContact({ stopRequestedAt: null });
      await recordConsent(
        tx,
        ctx,
        writer.id,
        "withdrawn",
        messageId,
        "followup",
      );
      await enqueueMessageJob(tx, ctx, "stopped_all", messageId);
      await auditSystem(
        tx,
        ctx.organizationId,
        "conversation.owner_stopped_all",
        followupId,
      );
      return { outcome: "stopped_all", triage: "normal" };
    }
    if (keyword === "resume") {
      await setContact({ stopRequestedAt: null });
      await enqueueMessageJob(tx, ctx, "resumed", messageId);
      return { outcome: "resumed", triage: "normal" };
    }
  }

  let outcome: InboundOutcome = "stored";
  let triage: TriageLevel = "normal";
  const member = Boolean(ctx.group) && !writer.leftGroupAt;

  if (
    keyword === "stop" &&
    consent?.state !== "withdrawn" &&
    !writer.stopRequestedAt
  ) {
    if (member && consent?.state === "given") {
      // Dans le groupe : quitter le groupe seulement, ou arrêter le suivi entier ?
      await setContact({ stopRequestedAt: now });
      await enqueueMessageJob(tx, ctx, "stop_clarify", messageId);
      outcome = "stop_clarify";
    } else {
      await recordConsent(tx, ctx, writer.id, "withdrawn", messageId);
      await enqueueMessageJob(tx, ctx, "stopped", messageId);
      outcome = "stopped";
    }
  } else if (
    (keyword === "yes" || keyword === "resume") &&
    consent?.state === "requested"
  ) {
    await recordConsent(tx, ctx, writer.id, "given", messageId);
    await enqueueMessageJob(tx, ctx, "consent_given", messageId);
    await scheduleReminders(tx, followupId, now);
    outcome = "consent_given";
  } else if (keyword === "resume" && consent?.state === "withdrawn") {
    await recordConsent(tx, ctx, writer.id, "given", messageId);
    await enqueueMessageJob(tx, ctx, "resumed", messageId);
    await scheduleReminders(tx, followupId, now);
    outcome = "resumed";
  } else {
    // Un message de contenu est toujours évalué, même repris en main ou en pause : l'équipe
    // est alertée dans tous les cas.
    const mayReply = mayReach(reach, writer) && (await numaMayReply(tx, ctx));
    ({ level: triage } = await triageOwnerMessage(tx, {
      organizationId: ctx.organizationId,
      followupId,
      responsibleMembershipId: ctx.responsibleMembershipId,
      messageId,
      body: text,
      // Le propriétaire réécrit après la fin du suivi automatisé : le vétérinaire est informé.
      afterAutomaticEnd: mayReply && ctx.status === "ended",
    }));
    if (triage === "urgent" && consent?.state !== "withdrawn") {
      // Consignes d'urgence tout de suite, même avant l'accord : ce sont les numéros du
      // cabinet, pas un contenu de suivi. Numa poursuit ensuite si elle a la main.
      await enqueueMessageJob(tx, ctx, "urgent", messageId);
      outcome = "urgent";
    }
    if (writer.stopRequestedAt) {
      // Toujours en attente de GROUPE ou TOUT : Numa repose la question, en privé.
      await enqueueMessageJob(tx, ctx, "stop_clarify", messageId);
      if (outcome === "stored") outcome = "stop_clarify";
    } else if (outcome === "urgent") {
      // La suite de la discussion part avec les consignes d'urgence.
    } else if (consent?.state === "requested") {
      // Une seule relance par demande d'accord : la clé de tâche dérive de la demande.
      await enqueueMessageJob(
        tx,
        ctx,
        "consent_reminder",
        messageId,
        consent.id,
      );
      outcome = "consent_reminder";
    } else if (mayReply) {
      // Une photo sans légende : accusé de réception fixe, sans passer par l'IA.
      await enqueueMessageJob(
        tx,
        ctx,
        options.photo && text.length === 0 ? "photo_received" : "reply",
        messageId,
      );
      outcome = "reply";
    }
    // Sinon (repris en main, en pause, arrêté, accord retiré) : conservé pour l'équipe.
  }
  return { outcome, triage };
}

async function receiveInTx(
  tx: TenantTransaction,
  followupId: string,
  body: string,
  from: ContactRole,
): Promise<{
  messageId: string;
  outcome: InboundOutcome;
  triage: TriageLevel;
}> {
  const { messageId } = await recordInbound(tx, followupId, body, from);
  return {
    messageId,
    ...(await processInbound(tx, followupId, messageId, body)),
  };
}

/** Pièces jointes des messages affichés, avec transcription et observations. */
async function attachmentsOf(
  tx: TenantTransaction,
  messageIds: string[],
): Promise<Map<string, MessageAttachment>> {
  const byMessage = new Map<string, MessageAttachment>();
  if (messageIds.length === 0) return byMessage;
  const rows = await tx
    .select({
      id: attachments.id,
      messageId: attachments.messageId,
      kind: attachments.kind,
      durationMs: attachments.durationMs,
      deletedAt: attachments.deletedAt,
      transcript: voiceTranscripts.text,
      observations: photoObservations.observations,
    })
    .from(attachments)
    .leftJoin(
      voiceTranscripts,
      eq(voiceTranscripts.attachmentId, attachments.id),
    )
    .leftJoin(
      photoObservations,
      eq(photoObservations.attachmentId, attachments.id),
    )
    .where(
      and(
        inArray(attachments.messageId, messageIds),
        inArray(attachments.kind, ["photo", "voice"]),
      ),
    );
  for (const row of rows) {
    if (!row.messageId || (row.kind !== "photo" && row.kind !== "voice"))
      continue;
    byMessage.set(row.messageId, {
      id: row.id,
      kind: row.kind,
      durationMs: row.durationMs,
      deleted: row.deletedAt !== null,
      transcript: row.transcript,
      observations: row.observations ? row.observations.split("\n") : [],
    });
  }
  return byMessage;
}

export function conversationsService(db: Database) {
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
    metadata: AuditMetadata = {},
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

  function parseBody(body: unknown): string {
    const parsed = ownerMessageInput.safeParse(body);
    if (!parsed.success) throw new DomainError("invalid_target");
    return parsed.data;
  }

  function parseRole(from: unknown): ContactRole {
    const parsed = contactRoleInput.safeParse(from ?? "primary");
    if (!parsed.success) throw new DomainError("invalid_target");
    return parsed.data;
  }

  function recipientsLabel(ctx: ConversationContext, targets: Target[]) {
    if (targets.length === 0) return null;
    const people = targets.flatMap((target) =>
      target.kind === "group" ? target.members : [target.contact],
    );
    return names(people, "fr");
  }

  return {
    /** Fil de la conversation, réservé à l'accès clinique. */
    async view(actor: Actor, followupId: string): Promise<ConversationView> {
      assertPermission(actor, "clinical.read");
      return run(actor, async (tx) => {
        const followup = await loadFollowup(tx, actor, followupId);
        if (followup.access !== "clinical") throw new DomainError("not_found");
        const ctx = await loadContext(tx, followupId);
        const reach = await reachOf(tx, ctx);
        const primary = primaryOf(ctx);
        const rows = await tx
          .select({
            id: messages.id,
            author: messages.author,
            authorName: users.displayName,
            body: messages.body,
            occurredAt: messages.occurredAt,
            delivery: messages.deliveryStatus,
            triage: triageEvents.level,
            threadKind: conversationThreads.kind,
            contactName: owners.fullName,
            contactRole: followupContacts.role,
          })
          .from(messages)
          .innerJoin(
            conversationThreads,
            eq(conversationThreads.id, messages.threadId),
          )
          .leftJoin(triageEvents, eq(triageEvents.messageId, messages.id))
          .leftJoin(
            memberships,
            eq(memberships.id, messages.authorMembershipId),
          )
          .leftJoin(users, eq(users.id, memberships.userId))
          .leftJoin(
            followupContacts,
            eq(followupContacts.id, messages.followupContactId),
          )
          .leftJoin(owners, eq(owners.id, followupContacts.ownerId))
          .where(eq(messages.followupId, followupId))
          .orderBy(desc(messages.occurredAt), desc(messages.id))
          .limit(MAX_VIEW_MESSAGES);
        const media = await attachmentsOf(
          tx,
          rows.map((row) => row.id),
        );
        return {
          followupId,
          status: followup.status,
          isTest: followup.isTest,
          animalName: followup.animalName,
          ownerFirstName: primary ? firstName(primary.ownerFullName) : null,
          consent: primary
            ? (reach.consents.get(primary.id)?.state ?? null)
            : null,
          contacts: ctx.contacts.map((contact) => ({
            firstName: firstName(contact.ownerFullName),
            role: contact.role,
            consent: reach.consents.get(contact.id)?.state ?? null,
            inGroup: Boolean(ctx.group) && !contact.leftGroupAt,
            leftGroup: Boolean(contact.leftGroupAt),
            leftGroupAt: contact.leftGroupAt,
            stopRequested: Boolean(contact.stopRequestedAt),
          })),
          group: Boolean(ctx.group),
          recipients: recipientsLabel(ctx, broadcastTargets(ctx, reach)),
          stoppedByOwner: reach.stopped,
          endedAutomatically:
            followup.status === "ended" &&
            (await lastStatusReason(tx, followupId)) === AUTOMATIC_END_REASON,
          messages: rows
            .reverse()
            .map(({ threadKind, contactName, ...row }) => ({
              ...row,
              channel: threadKind,
              contactName: contactName ? firstName(contactName) : null,
              attachment: media.get(row.id) ?? null,
            })),
          rights: {
            canWrite: canWriteToOwner(actor, followup.access),
            canResume: canResumeNuma(actor, followup.access),
          },
        };
      });
    },

    /**
     * Message écrit par un membre du cabinet : part du WhatsApp du cabinet (au groupe s'il
     * existe) et met Numa en pause (reprise en main) jusqu'à « Reprendre Numa ».
     */
    async writeToOwner(
      actor: Actor,
      followupId: string,
      rawBody: unknown,
    ): Promise<{ messageId: string; takeover: boolean }> {
      assertPermission(actor, "owner_messages.reply");
      assertPermission(actor, "clinical.read");
      const body = parseBody(rawBody);
      return run(actor, async (tx) => {
        const followup = await loadFollowup(tx, actor, followupId, true);
        if (!canWriteToOwner(actor, followup.access))
          throw new DomainError("forbidden");
        if (followup.status === "draft" || followup.isTest)
          throw new DomainError("invalid_transition");
        const ctx = await loadContext(tx, followupId);
        // Aucun contenu, même écrit par le vétérinaire, sans l'accord du propriétaire.
        const targets = broadcastTargets(ctx, await reachOf(tx, ctx));
        if (targets.length === 0) throw new DomainError("consent_missing");

        const ids: string[] = [];
        for (const target of targets) {
          const threadId =
            target.kind === "group"
              ? target.group.id
              : await ensureThread(tx, ctx, target.contact.id);
          const [message] = await tx
            .insert(messages)
            .values({
              organizationId: actor.organizationId,
              followupId,
              threadId,
              direction: "outbound",
              author: "vet",
              authorMembershipId: actor.membershipId,
              followupContactId:
                target.kind === "direct" ? target.contact.id : null,
              body,
              language:
                target.kind === "direct"
                  ? target.contact.language
                  : (target.members[0]?.language ?? "fr"),
              deliveryStatus: "queued",
              idempotencyKey: `vet:${randomUUID()}`,
            })
            .returning({ id: messages.id });
          if (!message) throw new Error("Message non enregistré");
          await enqueueMessageJob(tx, ctx, "deliver", message.id);
          ids.push(message.id);
        }
        const [messageId] = ids;
        if (!messageId) throw new Error("Message non enregistré");

        const takeover = followup.status === "active";
        if (takeover) {
          await setStatusReason(tx, "vet_takeover");
          await tx
            .update(followups)
            .set({ status: "human_takeover" })
            .where(eq(followups.id, followupId));
          await audit(tx, actor, "followup.human_takeover", followupId);
        }
        await audit(tx, actor, "conversation.message_sent", followupId, {
          messageId,
        });
        return { messageId, takeover };
      });
    },

    /** « Reprendre Numa » après une reprise en main : décision d'un vétérinaire. */
    async resumeNuma(actor: Actor, followupId: string) {
      assertPermission(actor, "owner_messages.reply");
      assertPermission(actor, "clinical.read");
      await run(actor, async (tx) => {
        const followup = await loadFollowup(tx, actor, followupId, true);
        if (!canResumeNuma(actor, followup.access))
          throw new DomainError("forbidden");
        if (followup.status !== "human_takeover")
          throw new DomainError("invalid_transition");
        await setStatusReason(tx, "numa_resumed");
        await tx
          .update(followups)
          .set({ status: "active" })
          .where(eq(followups.id, followupId));
        // Les rappels à venir reprennent ; ceux passés pendant la reprise en main, non.
        await scheduleReminders(tx, followupId, new Date());
        await audit(tx, actor, "followup.numa_resumed", followupId);
      });
    },

    /** Arrivée d'un message du propriétaire (point d'entrée du futur webhook WhatsApp). */
    async receiveOwnerMessage(
      organizationId: string,
      followupId: string,
      rawBody: unknown,
      rawFrom?: unknown,
    ) {
      if (!uuid.safeParse(followupId).success)
        throw new DomainError("not_found");
      const body = parseBody(rawBody);
      const from = parseRole(rawFrom);
      return withTenant(db, { organizationId }, (tx) =>
        receiveInTx(tx, followupId, body, from),
      );
    },

    /**
     * Simulateur du propriétaire (environnement local seulement, vérifié par l'appelant) :
     * un membre avec l'accès clinique joue l'un des propriétaires.
     */
    async simulateOwnerMessage(
      actor: Actor,
      followupId: string,
      rawBody: unknown,
      rawFrom?: unknown,
    ) {
      assertPermission(actor, "clinical.read");
      const body = parseBody(rawBody);
      const from = parseRole(rawFrom);
      return run(actor, async (tx) => {
        const followup = await loadFollowup(tx, actor, followupId);
        if (followup.access !== "clinical") throw new DomainError("not_found");
        const result = await receiveInTx(tx, followupId, body, from);
        await audit(tx, actor, "simulator.owner_message", followupId, {
          outcome: result.outcome,
        });
        return result;
      });
    },

    /**
     * Simulateur : avance jusqu'au prochain envoi prévu de ce suivi (message, rappel ou fin
     * du suivi automatisé) ; les tâches prévues à la même heure, ou déjà dues, partent aussi.
     */
    async makeDueNow(actor: Actor, followupId: string): Promise<number> {
      assertPermission(actor, "clinical.read");
      return run(actor, async (tx) => {
        const followup = await loadFollowup(tx, actor, followupId);
        if (followup.access !== "clinical") throw new DomainError("not_found");
        const pending = and(
          eq(scheduledJobs.followupId, followupId),
          eq(scheduledJobs.status, "pending"),
          inArray(scheduledJobs.kind, [...SIMULATED_KINDS]),
        );
        const [next] = await tx
          .select({ runAt: scheduledJobs.runAt })
          .from(scheduledJobs)
          .where(pending)
          .orderBy(asc(scheduledJobs.runAt))
          .limit(1);
        if (!next) return 0;
        const now = new Date();
        // La base garde les microsecondes : une milliseconde de marge inclut l'envoi suivant.
        const until = new Date(
          Math.max(next.runAt.getTime(), now.getTime()) + 1,
        );
        const updated = await tx
          .update(scheduledJobs)
          .set({ runAt: now })
          .where(and(pending, lte(scheduledJobs.runAt, until)))
          .returning({ id: scheduledJobs.id });
        return updated.length;
      });
    },
  };
}

export type ConversationsService = ReturnType<typeof conversationsService>;
