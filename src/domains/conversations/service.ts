import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import type { AiGateway } from "@/adapters/ai-gateway/types";
import type { WhatsAppConnector } from "@/adapters/whatsapp/types";
import type { AuditMetadata } from "@/domains/audit/schema";
import { DomainError, assertPermission } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import { loadFollowup, setStatusReason } from "@/domains/suivis/lancement";
import { canResumeNuma, canWriteToOwner } from "@/domains/suivis/policies";
import { JobError } from "@/domains/taches/kinds";
import { emit, enqueue } from "@/domains/taches/queue";
import type { JobHandler } from "@/domains/taches/worker";
import {
  animals,
  auditEvents,
  consents,
  conversationThreads,
  followupContacts,
  followups,
  memberships,
  messages,
  organizations,
  ownerContacts,
  owners,
  scheduledJobs,
  users,
} from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import type { Database, TenantTransaction } from "@/server/db/tenant";

import { checkNumaReply, safeFallback } from "./guard";
import { ownerKeyword } from "./keywords";
import { CONSENT_WORDING_VERSION, firstName, fixedMessage } from "./wording";
import type { FixedStep, WordingContext } from "./wording";

/**
 * Conversation WhatsApp d'un suivi (cahier des charges §3 à §5, ADR 0016).
 * - Tout envoi passe par la file de tâches (`followup.message`) : clé d'idempotence par
 *   message, transmise au prestataire, donc jamais de doublon même si l'envoi est rejoué.
 * - Premier message au nom du cabinet et du vétérinaire responsable, Numa présentée comme IA ;
 *   aucun contenu clinique tant que le propriétaire n'a pas répondu OUI.
 * - STOP retire l'accord, REPRENDRE le recrée ; chaque état est une ligne de `consents`.
 * - Un membre qui écrit au propriétaire met Numa en pause (reprise en main) jusqu'à
 *   « Reprendre Numa » par un vétérinaire.
 * - Les réponses de Numa viennent de la passerelle IA puis passent les garde-fous
 *   déterministes ; une réponse refusée est remplacée par un message sûr et journalisée.
 * Ni contenu, ni numéro, ni nom n'entre dans le journal : seulement des identifiants et codes.
 * Phase 2 : deux propriétaires et groupe WhatsApp au lot 18 ; seul le contact principal écrit.
 */

type Status = "draft" | "active" | "paused" | "human_takeover" | "ended";
type ConsentState = "requested" | "given" | "withdrawn";

export type ConversationMessage = {
  id: string;
  author: "owner" | "numa" | "vet" | "system";
  authorName: string | null;
  body: string;
  occurredAt: Date;
  delivery: "queued" | "sent" | "delivered" | "read" | "failed" | null;
};

export type ConversationView = {
  followupId: string;
  status: Status;
  isTest: boolean;
  animalName: string;
  ownerFirstName: string | null;
  consent: ConsentState | null;
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
  | "stored";

const MAX_BODY = 4096;
const MAX_VIEW_MESSAGES = 300;

export const ownerMessageInput = z
  .string()
  .trim()
  .min(1, "Écrivez un message.")
  .max(MAX_BODY, "Message trop long.");

const uuid = z.uuid();

const jobPayload = z.discriminatedUnion("step", [
  z.object({ step: z.literal("intro") }),
  z.object({
    step: z.enum([
      "consent_given",
      "consent_reminder",
      "stopped",
      "resumed",
      "reply",
      "deliver",
    ]),
    messageId: z.uuid(),
  }),
]);

type Contact = {
  id: string;
  ownerFullName: string;
  phone: string;
  language: "fr" | "en";
};

type ConversationContext = {
  followupId: string;
  organizationId: string;
  status: Status;
  isTest: boolean;
  animalName: string;
  practiceName: string;
  vetName: string;
  firstContactAt: Date | null;
  contact: Contact | null;
};

/** Suivi, cabinet, vétérinaire responsable et contact principal actif, sans contrôle d'accès. */
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
  const [contact] = await tx
    .select({
      id: followupContacts.id,
      ownerFullName: owners.fullName,
      phone: ownerContacts.value,
      language: followupContacts.language,
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
        eq(followupContacts.role, "primary"),
        eq(followupContacts.active, true),
      ),
    );
  return { ...row, contact: contact ?? null };
}

function wordingOf(ctx: ConversationContext, contact: Contact): WordingContext {
  return {
    language: contact.language,
    ownerFirstName: firstName(contact.ownerFullName),
    animalName: ctx.animalName,
    practiceName: ctx.practiceName,
    vetName: ctx.vetName,
  };
}

async function latestConsent(
  tx: TenantTransaction,
  contactId: string,
): Promise<{ id: string; state: ConsentState } | null> {
  const [row] = await tx
    .select({ id: consents.id, state: consents.state })
    .from(consents)
    .where(eq(consents.followupContactId, contactId))
    .orderBy(desc(consents.recordedAt))
    .limit(1);
  return row ?? null;
}

async function recordConsent(
  tx: TenantTransaction,
  ctx: ConversationContext,
  contactId: string,
  state: ConsentState,
  messageId: string,
) {
  await tx.insert(consents).values({
    organizationId: ctx.organizationId,
    followupId: ctx.followupId,
    followupContactId: contactId,
    state,
    wordingVersion: CONSENT_WORDING_VERSION,
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

async function enqueueMessageJob(
  tx: TenantTransaction,
  ctx: ConversationContext,
  step: Exclude<z.infer<typeof jobPayload>["step"], "intro">,
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
 * réponses de Numa et envoi des messages écrits par l'équipe. Chaque cas revérifie l'état
 * au moment de l'envoi (pause, reprise en main, retrait d'accord) : rien ne part à tort.
 */
export function conversationHandlers(deps: {
  whatsapp: WhatsAppConnector;
  ai: AiGateway;
}): Record<string, JobHandler> {
  const { whatsapp, ai } = deps;

  async function deliver(
    tx: TenantTransaction,
    message: { id: string; body: string; idempotencyKey: string },
    phone: string,
  ) {
    let externalRef: string;
    try {
      ({ externalRef } = await whatsapp.sendMessage({
        to: phone,
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
    contact: Contact,
    key: string,
    body: string,
  ): Promise<string> {
    const threadId = await ensureThread(tx, ctx, contact.id);
    await tx
      .insert(messages)
      .values({
        organizationId: ctx.organizationId,
        followupId: ctx.followupId,
        threadId,
        direction: "outbound",
        author: "numa",
        followupContactId: contact.id,
        body,
        language: contact.language,
        deliveryStatus: "queued",
        idempotencyKey: key,
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
        contact.phone,
      );
    return message.id;
  }

  async function inbound(tx: TenantTransaction, messageId: string) {
    const [message] = await tx
      .select({
        id: messages.id,
        followupId: messages.followupId,
        body: messages.body,
        author: messages.author,
        followupContactId: messages.followupContactId,
      })
      .from(messages)
      .where(eq(messages.id, messageId));
    if (!message || message.author !== "owner")
      throw new JobError("target_missing");
    return message;
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
    const contact = ctx.contact;
    if (!contact) throw new JobError("target_missing");

    if (payload.step === "intro") {
      // En pause, repris en main ou arrêté : la reprise du suivi replanifie ce message.
      if (ctx.status !== "active") return;
      if (await latestConsent(tx, contact.id)) return;
      const body = fixedMessage("intro", wordingOf(ctx, contact));
      const id = await sendNuma(tx, ctx, contact, `intro:${contact.id}`, body);
      // La demande d'accord porte la référence du premier message, qui en contient le texte.
      await recordConsent(tx, ctx, contact.id, "requested", id);
      return;
    }

    if (payload.step === "deliver") {
      const [message] = await tx
        .select({
          id: messages.id,
          author: messages.author,
          body: messages.body,
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
      const consent = await latestConsent(tx, contact.id);
      if (consent?.state !== "given") {
        // Accord retiré entre l'écriture et l'envoi : le message ne part pas.
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
        contact.phone,
      );
      return;
    }

    const source = await inbound(tx, payload.messageId);
    if (source.followupId !== ctx.followupId)
      throw new JobError("target_missing");
    const key = `${payload.step}:${source.id}`;

    if (payload.step === "reply") {
      const consent = await latestConsent(tx, contact.id);
      // Reprise en main, pause, arrêt ou accord retiré depuis l'arrivée du message.
      if (ctx.status !== "active" || consent?.state !== "given") return;
      let text: string;
      try {
        ({ text } = await ai.numaReply({
          language: contact.language,
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
      const body = verdict.ok
        ? text
        : safeFallback(contact.language, ctx.practiceName);
      await sendNuma(tx, ctx, contact, key, body);
      return;
    }

    if (payload.step === "consent_reminder") {
      const consent = await latestConsent(tx, contact.id);
      if (consent?.state !== "requested") return;
    }
    const step: FixedStep = payload.step;
    await sendNuma(
      tx,
      ctx,
      contact,
      key,
      fixedMessage(step, wordingOf(ctx, contact)),
    );
  };

  return { "followup.message": handler };
}

/**
 * Message du propriétaire, reçu par WhatsApp (simulé en phase 2). Il est toujours conservé ;
 * ce qu'il déclenche dépend de l'accord en cours et de l'état du suivi.
 */
async function receiveInTx(
  tx: TenantTransaction,
  followupId: string,
  body: string,
): Promise<{ messageId: string; outcome: InboundOutcome }> {
  const ctx = await loadContext(tx, followupId, true);
  if (ctx.status === "draft" || ctx.isTest)
    throw new DomainError("invalid_transition");
  const contact = ctx.contact;
  if (!contact) throw new DomainError("not_found");
  const threadId = await ensureThread(tx, ctx, contact.id);
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
  const messageId = message.id;

  const keyword = ownerKeyword(body);
  const consent = await latestConsent(tx, contact.id);
  let outcome: InboundOutcome = "stored";

  if (keyword === "stop" && consent?.state !== "withdrawn") {
    await recordConsent(tx, ctx, contact.id, "withdrawn", messageId);
    await enqueueMessageJob(tx, ctx, "stopped", messageId);
    outcome = "stopped";
  } else if (
    (keyword === "yes" || keyword === "resume") &&
    consent?.state === "requested"
  ) {
    await recordConsent(tx, ctx, contact.id, "given", messageId);
    await enqueueMessageJob(tx, ctx, "consent_given", messageId);
    outcome = "consent_given";
  } else if (keyword === "resume" && consent?.state === "withdrawn") {
    await recordConsent(tx, ctx, contact.id, "given", messageId);
    await enqueueMessageJob(tx, ctx, "resumed", messageId);
    outcome = "resumed";
  } else if (consent?.state === "requested") {
    // Une seule relance par demande d'accord : la clé de tâche dérive de la demande.
    await enqueueMessageJob(tx, ctx, "consent_reminder", messageId, consent.id);
    outcome = "consent_reminder";
  } else if (consent?.state === "given" && ctx.status === "active") {
    await enqueueMessageJob(tx, ctx, "reply", messageId);
    outcome = "reply";
  }
  // Sinon (repris en main, en pause, terminé, accord retiré) : conservé pour l'équipe.

  await emit(tx, {
    organizationId: ctx.organizationId,
    topic: "message.received",
    aggregateType: "message",
    aggregateId: messageId,
  });
  return { messageId, outcome };
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

  return {
    /** Fil de la conversation, réservé à l'accès clinique. */
    async view(actor: Actor, followupId: string): Promise<ConversationView> {
      assertPermission(actor, "clinical.read");
      return run(actor, async (tx) => {
        const followup = await loadFollowup(tx, actor, followupId);
        if (followup.access !== "clinical") throw new DomainError("not_found");
        const ctx = await loadContext(tx, followupId);
        const consent = ctx.contact
          ? await latestConsent(tx, ctx.contact.id)
          : null;
        const rows = await tx
          .select({
            id: messages.id,
            author: messages.author,
            authorName: users.displayName,
            body: messages.body,
            occurredAt: messages.occurredAt,
            delivery: messages.deliveryStatus,
          })
          .from(messages)
          .leftJoin(
            memberships,
            eq(memberships.id, messages.authorMembershipId),
          )
          .leftJoin(users, eq(users.id, memberships.userId))
          .where(eq(messages.followupId, followupId))
          .orderBy(desc(messages.occurredAt), desc(messages.id))
          .limit(MAX_VIEW_MESSAGES);
        return {
          followupId,
          status: followup.status,
          isTest: followup.isTest,
          animalName: followup.animalName,
          ownerFirstName: ctx.contact
            ? firstName(ctx.contact.ownerFullName)
            : null,
          consent: consent?.state ?? null,
          messages: rows.reverse(),
          rights: {
            canWrite: canWriteToOwner(actor, followup.access),
            canResume: canResumeNuma(actor, followup.access),
          },
        };
      });
    },

    /**
     * Message écrit par un membre du cabinet : part du WhatsApp du cabinet et met Numa en
     * pause (reprise en main) jusqu'à « Reprendre Numa ».
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
        const contact = ctx.contact;
        if (!contact) throw new DomainError("not_found");
        // Aucun contenu, même écrit par le vétérinaire, sans l'accord du propriétaire.
        const consent = await latestConsent(tx, contact.id);
        if (consent?.state !== "given")
          throw new DomainError("consent_missing");

        const threadId = await ensureThread(tx, ctx, contact.id);
        const [message] = await tx
          .insert(messages)
          .values({
            organizationId: actor.organizationId,
            followupId,
            threadId,
            direction: "outbound",
            author: "vet",
            authorMembershipId: actor.membershipId,
            followupContactId: contact.id,
            body,
            language: contact.language,
            deliveryStatus: "queued",
            idempotencyKey: `vet:${randomUUID()}`,
          })
          .returning({ id: messages.id });
        if (!message) throw new Error("Message non enregistré");
        await enqueueMessageJob(tx, ctx, "deliver", message.id);

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
          messageId: message.id,
        });
        return { messageId: message.id, takeover };
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
        await audit(tx, actor, "followup.numa_resumed", followupId);
      });
    },

    /** Arrivée d'un message du propriétaire (point d'entrée du futur webhook WhatsApp). */
    async receiveOwnerMessage(
      organizationId: string,
      followupId: string,
      rawBody: unknown,
    ) {
      if (!uuid.safeParse(followupId).success)
        throw new DomainError("not_found");
      const body = parseBody(rawBody);
      return withTenant(db, { organizationId }, (tx) =>
        receiveInTx(tx, followupId, body),
      );
    },

    /**
     * Simulateur du propriétaire (environnement local seulement, vérifié par l'appelant) :
     * un membre avec l'accès clinique joue le propriétaire.
     */
    async simulateOwnerMessage(
      actor: Actor,
      followupId: string,
      rawBody: unknown,
    ) {
      assertPermission(actor, "clinical.read");
      const body = parseBody(rawBody);
      return run(actor, async (tx) => {
        const followup = await loadFollowup(tx, actor, followupId);
        if (followup.access !== "clinical") throw new DomainError("not_found");
        const result = await receiveInTx(tx, followupId, body);
        await audit(tx, actor, "simulator.owner_message", followupId, {
          outcome: result.outcome,
        });
        return result;
      });
    },

    /** Simulateur : les envois en attente de ce suivi deviennent dus tout de suite. */
    async makeDueNow(actor: Actor, followupId: string): Promise<number> {
      assertPermission(actor, "clinical.read");
      return run(actor, async (tx) => {
        const followup = await loadFollowup(tx, actor, followupId);
        if (followup.access !== "clinical") throw new DomainError("not_found");
        const updated = await tx
          .update(scheduledJobs)
          .set({ runAt: new Date() })
          .where(
            and(
              eq(scheduledJobs.followupId, followupId),
              eq(scheduledJobs.status, "pending"),
              inArray(scheduledJobs.kind, ["followup.message"]),
            ),
          )
          .returning({ id: scheduledJobs.id });
        return updated.length;
      });
    },
  };
}

export type ConversationsService = ReturnType<typeof conversationsService>;
