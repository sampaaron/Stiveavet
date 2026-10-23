import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";

import { DomainError, assertPermission } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import { loadFollowup, setStatusReason } from "@/domains/suivis/lancement";
import { canResumeNuma, canWriteToOwner } from "@/domains/suivis/policies";
import {
  AUTOMATIC_END_REASON,
  lastStatusReason,
  scheduleReminders,
} from "@/domains/suivis/rappels";
import {
  attachments,
  conversationThreads,
  followupContacts,
  followups,
  memberships,
  messages,
  owners,
  photoObservations,
  scheduledJobs,
  triageEvents,
  users,
  voiceTranscripts,
} from "@/server/db/schema";
import { tenantRunner, withTenant } from "@/server/db/tenant";
import type { Database, TenantTransaction } from "@/server/db/tenant";
import { auditFollowup as audit } from "@/domains/audit/journal";

import { firstName } from "./wording";
import type {
  ContactRole,
  ConversationView,
  MessageAttachment,
  Target,
} from "./contexte";
import {
  broadcastTargets,
  contactRoleInput,
  enqueueMessageJob,
  ensureThread,
  loadContext,
  MAX_VIEW_MESSAGES,
  ownerLanguageInput,
  ownerMessageInput,
  primaryOf,
  reachOf,
  SIMULATED_KINDS,
  uuid,
} from "./contexte";
import { receiveInTx } from "./reception";

export { ownerMessageInput, contactRoleInput } from "./contexte";
export type {
  ConsentState,
  ConversationMessage,
  SystemNote,
  MessageAttachment,
  ConversationContact,
  LanguageSource,
  ConversationView,
  InboundOutcome,
  ContactRole,
} from "./contexte";

export { conversationHandlers } from "./taches";

export {
  recordInbound,
  currentConsentState,
  processInbound,
  receiveInTx,
} from "./reception";

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
  const run = tenantRunner(db);

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

  function recipientNames(targets: Target[]): string[] | null {
    if (targets.length === 0) return null;
    return targets
      .flatMap((target) =>
        target.kind === "group" ? target.members : [target.contact],
      )
      .map((contact) => firstName(contact.ownerFullName));
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
            noteCode: messages.noteCode,
            noteNames: messages.noteNames,
          })
          .from(messages)
          .innerJoin(
            conversationThreads,
            eq(conversationThreads.id, messages.threadId),
          )
          // Le suivi dans la jointure : seuls les triages de ce suivi sont lus.
          .leftJoin(
            triageEvents,
            and(
              eq(triageEvents.followupId, messages.followupId),
              eq(triageEvents.messageId, messages.id),
            ),
          )
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
            language: contact.language,
            languageSource: contact.languageSource,
          })),
          group: Boolean(ctx.group),
          recipients: recipientNames(broadcastTargets(ctx, reach)),
          stoppedByOwner: reach.stopped,
          endedAutomatically:
            followup.status === "ended" &&
            (await lastStatusReason(tx, followupId)) === AUTOMATIC_END_REASON,
          messages: rows
            .reverse()
            .map(
              ({ threadKind, contactName, noteCode, noteNames, ...row }) => ({
                ...row,
                note: noteCode ? { code: noteCode, names: noteNames } : null,
                channel: threadKind,
                contactName: contactName ? firstName(contactName) : null,
                attachment: media.get(row.id) ?? null,
              }),
            ),
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

    /**
     * Langue de Numa avec un propriétaire, corrigée par un vétérinaire (lot 19) : elle prime
     * ensuite sur la détection. Chaque correction est journalisée.
     */
    async setOwnerLanguage(
      actor: Actor,
      followupId: string,
      rawInput: unknown,
    ): Promise<void> {
      assertPermission(actor, "owner_messages.reply");
      assertPermission(actor, "clinical.read");
      const parsed = ownerLanguageInput.safeParse(rawInput);
      if (!parsed.success) throw new DomainError("invalid_target");
      const { role, language } = parsed.data;
      await run(actor, async (tx) => {
        const followup = await loadFollowup(tx, actor, followupId, true);
        if (!canResumeNuma(actor, followup.access))
          throw new DomainError("forbidden");
        const ctx = await loadContext(tx, followupId, true);
        const contact = ctx.contacts.find((c) => c.role === role);
        if (!contact) throw new DomainError("invalid_target");
        if (contact.language === language && contact.languageSource === "vet")
          return;
        await tx
          .update(followupContacts)
          .set({ language, languageSource: "vet" })
          .where(eq(followupContacts.id, contact.id));
        await audit(tx, actor, "followup.owner_language_changed", followupId, {
          role,
          language,
        });
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
