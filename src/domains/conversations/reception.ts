import { and, eq } from "drizzle-orm";

import { DomainError } from "@/domains/equipe/actor";
import { scheduleReminders } from "@/domains/suivis/rappels";
import { triageOwnerMessage } from "@/domains/urgences/service";
import type { TriageLevel } from "@/domains/urgences/triage";
import { releaseHeld } from "@/domains/whatsapp/envoi";
import { emit } from "@/domains/taches/queue";
import { followupContacts, messages } from "@/server/db/schema";
import type { TenantTransaction } from "@/server/db/tenant";
import { auditFollowup, systemAuthor } from "@/domains/audit/journal";

import { ownerKeyword } from "./keywords";
import { detectLanguage } from "./language";
import { firstName } from "./wording";
import type {
  ConsentState,
  Contact,
  ContactRole,
  ConversationContext,
  InboundOutcome,
} from "./contexte";
import {
  enqueueMessageJob,
  ensureThread,
  loadContext,
  mayReach,
  numaMayReply,
  primaryOf,
  reachOf,
  recordConsent,
  systemNote,
} from "./contexte";

/**
 * Réception d'un message du propriétaire : enregistrement, langue, mots-clés (OUI, STOP,
 * REPRENDRE…), tri des urgences, puis réponse de Numa par la file de tâches.
 */

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
  // Fenêtre de 24 h rouverte : les messages qui attendaient sa réponse partent.
  await releaseHeld(tx, {
    id: message.id,
    threadId,
    followupContactId: contact.id,
  });
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
 * Langue reconnue dans un message du propriétaire (lot 19) : Numa lui répond désormais dans
 * cette langue. Jamais quand le cabinet l'a choisie lui-même ; jamais sur un message ambigu.
 */
async function learnLanguage(
  tx: TenantTransaction,
  ctx: ConversationContext,
  writer: Contact,
  text: string,
) {
  if (writer.languageSource === "vet") return;
  const detected = detectLanguage(text);
  if (!detected || detected === writer.language) return;
  await tx
    .update(followupContacts)
    .set({ language: detected, languageSource: "detected" })
    .where(eq(followupContacts.id, writer.id));
  writer.language = detected;
  writer.languageSource = "detected";
  await auditFollowup(
    tx,
    systemAuthor(ctx.organizationId),
    "followup.owner_language_detected",
    ctx.followupId,
    { role: writer.role, language: detected },
  );
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
  /** Photo reçue, ou fichier refusé (trop lourd, format non lu, lot 22). */
  options: { media?: "photo" | "refused" } = {},
): Promise<{ outcome: InboundOutcome; triage: TriageLevel }> {
  const ctx = await loadContext(tx, followupId, true);
  const [source] = await tx
    .select({
      contactId: messages.followupContactId,
      threadId: messages.threadId,
    })
    .from(messages)
    .where(
      and(eq(messages.id, messageId), eq(messages.followupId, followupId)),
    );
  const writer = ctx.contacts.find((c) => c.id === source?.contactId);
  if (!writer || !source) throw new DomainError("not_found");
  // L'équipe voit qu'un fichier envoyé n'a pas pu être reçu.
  if (options.media === "refused")
    await systemNote(tx, ctx, source.threadId, {
      code: "file_refused",
      names: [firstName(writer.ownerFullName)],
    });
  await learnLanguage(tx, ctx, writer, text);
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
      await auditFollowup(
        tx,
        systemAuthor(ctx.organizationId),
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
      await auditFollowup(
        tx,
        systemAuthor(ctx.organizationId),
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
      // Fichier refusé, ou photo sans légende : message fixe, sans passer par l'IA.
      await enqueueMessageJob(
        tx,
        ctx,
        options.media === "refused"
          ? "file_refused"
          : options.media === "photo" && text.length === 0
            ? "photo_received"
            : "reply",
        messageId,
      );
      outcome = "reply";
    }
    // Sinon (repris en main, en pause, arrêté, accord retiré) : conservé pour l'équipe.
  }
  return { outcome, triage };
}

export async function receiveInTx(
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
