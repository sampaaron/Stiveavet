import { and, count, desc, eq, gt, sql } from "drizzle-orm";

import type {
  AiGateway,
  NumaReply,
  NumaReplyInput,
  NumaStepInput,
} from "@/adapters/ai-gateway/types";
import { WhatsAppSendError } from "@/adapters/whatsapp/types";
import type { WhatsAppConnector } from "@/adapters/whatsapp/types";
import {
  appointmentKindFor,
  appointmentMinutes,
  findSlots,
  lockVetAgenda,
  slotStillFree,
} from "@/domains/agenda/demandes";
import {
  appointmentDecisionMessage,
  appointmentMessage,
  slotChoice,
  wantsAppointment,
} from "@/domains/agenda/rendez-vous";
import type { AppointmentWording } from "@/domains/agenda/rendez-vous";
import { DomainError } from "@/domains/equipe/actor";
import { REMINDER_KIND } from "@/domains/suivis/rappels";
import { JobError } from "@/domains/taches/kinds";
import { emergencyGuidance } from "@/domains/urgences/service";
import type { WhatsAppProvider } from "@/domains/whatsapp/connexion";
import { freeTextAllowed, queueSend } from "@/domains/whatsapp/envoi";
import { TEMPLATE_BODY_MAX, renderTemplate } from "@/domains/whatsapp/modeles";
import type {
  AnyJobHandler,
  ClaimedJob,
  StagedJobHandler,
} from "@/domains/taches/worker";
import {
  appointmentRequests,
  appointments,
  attachments,
  conversationThreads,
  followupSteps,
  followups,
  messages,
  voiceTranscripts,
} from "@/server/db/schema";
import type { TenantTransaction } from "@/server/db/tenant";
import { auditFollowup as audit, systemAuthor } from "@/domains/audit/journal";

import { checkNumaReply, safeFallback } from "./guard";
import { numaFixedReply } from "./renvois";
import { emergencyMessage, firstName, fixedContent } from "./wording";
import type { FixedStep, NumaContent } from "./wording";
import type {
  Contact,
  ConversationContext,
  Group,
  JobPayload,
  Reach,
  SystemNote,
  Target,
} from "./contexte";
import {
  broadcastTargets,
  direct,
  ensureThread,
  groupMembers,
  groupTarget,
  jobPayload,
  loadContext,
  mayReach,
  numaMayReply,
  otherOf,
  reachOf,
  recordConsent,
  reminderPayload,
  replyTarget,
  systemNote,
  targetId,
  wordingFor,
} from "./contexte";

/** Rédactions de l'IA faites avant la transaction d'écriture, par demande ; null : en panne. */
type Drafts<T> = ReadonlyMap<string, T | null>;

const draftKey = (input: object) => JSON.stringify(input);

/** Une demande par rédaction, hors transaction ; une panne de la passerelle donne null. */
async function draftAll<Input extends object, T>(
  inputs: readonly Input[],
  call: (input: Input) => Promise<T>,
): Promise<Drafts<T>> {
  const drafts = new Map<string, T | null>();
  for (const input of inputs)
    if (!drafts.has(draftKey(input)))
      drafts.set(draftKey(input), await call(input).catch(() => null));
  return drafts;
}

/**
 * Rédaction préparée pour cette demande. Absente : l'état a changé depuis la préparation
 * (langue, destinataire) ; rien n'est écrit et la tâche est retentée avec l'état à jour.
 */
function drafted<T>(drafts: Drafts<T>, input: object): T | null {
  const key = draftKey(input);
  if (!drafts.has(key)) throw new JobError("provider_unavailable");
  return drafts.get(key) ?? null;
}

/** Une étape de `followup.message`, sous le verrou du suivi. */
type Turn = {
  tx: TenantTransaction;
  ctx: ConversationContext;
  reach: Reach;
  payload: JobPayload;
  replies: Drafts<NumaReply>;
};

type Source = {
  id: string;
  followupId: string;
  threadId: string;
  body: string;
  followupContactId: string | null;
};

/** Étape déclenchée par un message du propriétaire, dont l'auteur est connu. */
type SourceTurn = Turn & { source: Source; writer: Contact; key: string };

/**
 * Tâches `followup.message` : premier message, accusés de consentement, relance d'accord,
 * groupe, réponses de Numa, rendez-vous et envoi des messages écrits par l'équipe. Chaque cas
 * revérifie l'état au moment de l'envoi (pause, reprise en main, retrait d'accord, STOP dans
 * le groupe) : rien ne part à tort.
 */
export function conversationHandlers(deps: {
  whatsapp: WhatsAppProvider;
  ai: AiGateway;
}): Record<string, AnyJobHandler> {
  const { whatsapp, ai } = deps;

  /** Opération de groupe (simulée) : un échec du prestataire est réessayé. */
  async function groupCall<T>(
    tx: TenantTransaction,
    call: (connector: WhatsAppConnector) => Promise<T>,
  ): Promise<T> {
    try {
      return await call(await whatsapp.connectorFor(tx));
    } catch (error) {
      if (error instanceof WhatsAppSendError && error.failure === "account")
        throw new JobError("provider_account");
      throw new JobError("provider_unavailable");
    }
  }

  /**
   * Message de Numa : créé une seule fois par clé, puis confié à la tâche d'envoi
   * (`whatsapp.send`, ADR 0024). Un modèle garde sa clé et ses paramètres avec le texte.
   */
  async function sendNuma(
    tx: TenantTransaction,
    ctx: ConversationContext,
    target: Target,
    key: string,
    content: NumaContent,
  ): Promise<string> {
    const template = typeof content === "string" ? null : content;
    const body = typeof content === "string" ? content : content.body;
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
        templateKey: template?.key ?? null,
        templateParams: template?.params ?? [],
        occurredAt: sql`clock_timestamp()`,
      })
      .onConflictDoNothing({
        target: [messages.organizationId, messages.idempotencyKey],
      });
    const [message] = await tx
      .select({
        id: messages.id,
        deliveryStatus: messages.deliveryStatus,
      })
      .from(messages)
      .where(eq(messages.idempotencyKey, key));
    if (!message) throw new JobError("target_missing");
    if (message.deliveryStatus === "queued")
      await queueSend(tx, {
        organizationId: ctx.organizationId,
        followupId: ctx.followupId,
        threadId,
        id: message.id,
      });
    return message.id;
  }

  /** Même message (rédigé pour chacun) à plusieurs destinataires, une clé par destinataire. */
  async function sendEach(
    tx: TenantTransaction,
    ctx: ConversationContext,
    targets: readonly Target[],
    key: string,
    contentOf: (target: Target) => NumaContent | Promise<NumaContent>,
  ) {
    for (const target of targets)
      await sendNuma(
        tx,
        ctx,
        target,
        targets.length === 1 ? key : `${key}:${targetId(target)}`,
        await contentOf(target),
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
    const { groupRef } = await groupCall(tx, (connector) =>
      connector.createGroup({
        name: `${ctx.animalName} · ${ctx.practiceName}`.slice(0, 100),
        members: members.map((member) => member.phone),
        idempotencyKey: `group:${ctx.followupId}:${(existing?.n ?? 0) + 1}`,
      }),
    );
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
    await systemNote(tx, ctx, group.id, {
      code: "group_created",
      names: members.map((member) => firstName(member.ownerFullName)),
    });
    await audit(
      tx,
      systemAuthor(ctx.organizationId),
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
    note: SystemNote,
  ) {
    await groupCall(tx, (connector) =>
      connector.closeGroup({
        groupRef: group.externalRef,
        idempotencyKey: `group-close:${group.id}`,
      }),
    );
    await tx
      .update(conversationThreads)
      .set({ closedAt: new Date() })
      .where(eq(conversationThreads.id, group.id));
    await systemNote(tx, ctx, group.id, note);
  }

  async function inbound(
    tx: TenantTransaction,
    messageId: string,
  ): Promise<Source> {
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
    await audit(
      tx,
      systemAuthor(ctx.organizationId),
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
    await audit(
      tx,
      systemAuthor(ctx.organizationId),
      "appointment.proposed",
      ctx.followupId,
      { appointmentId: appointment.id },
    );
  }

  /** Demande de rendez-vous ouverte dans cette conversation (verrouillée pour l'écriture). */
  async function openRequest(
    tx: TenantTransaction,
    threadId: string,
    lock: boolean,
  ) {
    const query = tx
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
          eq(appointmentRequests.threadId, threadId),
          eq(appointmentRequests.status, "offered"),
          gt(appointmentRequests.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(appointmentRequests.createdAt))
      .limit(1);
    const [request] = lock ? await query.for("update") : await query;
    return request ?? null;
  }

  /**
   * Ce que Numa répond à un message, lu sans rien écrire : rien (déjà répondu), choix d'un
   * créneau, demande de rendez-vous, ou réponse de l'IA (avec la demande faite à l'IA).
   */
  async function replyPlan(
    tx: TenantTransaction,
    ctx: ConversationContext,
    target: Target,
    source: Source,
    lock: boolean,
  ) {
    const [answered] = await tx
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.idempotencyKey, `reply:${source.id}`));
    if (answered) return { kind: "answered" as const };
    const choice = slotChoice(source.body);
    const request =
      choice !== null ? await openRequest(tx, source.threadId, lock) : null;
    if (choice !== null && request)
      return { kind: "slot" as const, request, choice };
    if (wantsAppointment(source.body)) return { kind: "offer" as const };
    const input: NumaReplyInput = {
      language: wordingFor(ctx, target).language,
      animalName: ctx.animalName,
      practiceName: ctx.practiceName,
      ownerMessage: source.body,
    };
    return { kind: "ai" as const, input };
  }

  /** Numa a la main pour répondre à ce message : à qui, ou null. */
  async function numaTarget(
    tx: TenantTransaction,
    ctx: ConversationContext,
    reach: Reach,
    writer: Contact,
    source: Source,
  ): Promise<Target | null> {
    const target = replyTarget(ctx, reach, writer, source.threadId);
    return target && (await numaMayReply(tx, ctx)) ? target : null;
  }

  /** Réponse de Numa : choix d'un créneau, demande de rendez-vous, ou réponse de l'IA. */
  async function respond(turn: SourceTurn, target: Target) {
    const { tx, ctx, writer, source } = turn;
    const key = `reply:${source.id}`;
    const plan = await replyPlan(tx, ctx, target, source, true);
    switch (plan.kind) {
      case "answered":
        return;
      case "slot":
        return chooseSlot(
          tx,
          ctx,
          target,
          writer,
          source,
          plan.request,
          plan.choice,
          key,
        );
      case "offer":
        return offerSlots(tx, ctx, target, writer, source, key);
      case "ai":
        return aiReply(
          tx,
          ctx,
          target,
          plan.input.language,
          drafted(turn.replies, plan.input),
          key,
        );
    }
  }

  /** Réponse de Numa rédigée par la passerelle IA (avant la transaction), filtrée par les garde-fous. */
  async function aiReply(
    tx: TenantTransaction,
    ctx: ConversationContext,
    target: Target,
    language: "fr" | "en",
    reply: NumaReply | null,
    key: string,
  ) {
    // Fournisseur en panne ou réponse hors format : le propriétaire n'attend pas, il est
    // renvoyé vers l'équipe (ADR 0026). Le message reste lu par le vétérinaire.
    if (!reply)
      await audit(
        tx,
        systemAuthor(ctx.organizationId),
        "numa.ai_unavailable",
        ctx.followupId,
      );
    let text = reply?.text ?? "";
    // Hors simples nouvelles, Numa répond par un texte fixe validé, jamais par celui du modèle.
    if (text && reply && reply.intent !== "ack")
      text = numaFixedReply(reply.intent, { ...ctx, language });
    const verdict = text ? checkNumaReply(text) : null;
    if (verdict && !verdict.ok)
      await audit(
        tx,
        systemAuthor(ctx.organizationId),
        "numa.reply_blocked",
        ctx.followupId,
        { reason: verdict.reason },
      );
    const body = verdict?.ok ? text : safeFallback(language, ctx.practiceName);
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
      whatsapp.groups &&
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
        fixedContent("group_welcome", wordingFor(ctx, group)),
      );
      return;
    }
    const waiting =
      whatsapp.groups &&
      step === "consent_given" &&
      other !== null &&
      !ctx.group &&
      reach.consents.get(other.id)?.state !== "given";
    await sendNuma(
      tx,
      ctx,
      direct(writer),
      key,
      fixedContent(
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
      appointmentDecisionMessage(
        {
          kind: step === "appointment_confirmed" ? "confirmed" : "declined",
          at: row.startsAt,
        },
        appointmentWording(ctx, target),
      ),
    );
  }

  /** Premier message à chaque contact qui n'a pas encore reçu de demande d'accord. */
  async function intro({ tx, ctx, reach }: Turn) {
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
        fixedContent(
          pair ? (whatsapp.groups ? "intro_pair" : "intro_separate") : "intro",
          wordingFor(ctx, direct(contact)),
        ),
      );
      // La demande d'accord porte la référence du premier message, qui en contient le texte.
      await recordConsent(tx, ctx, contact.id, "requested", id);
    }
  }

  async function closing({ tx, ctx, reach, payload }: Turn) {
    if (!("token" in payload)) throw new JobError("invalid_payload");
    // Réactivé entre-temps, ou accord retiré : pas de message de clôture.
    if (ctx.status !== "ended") return;
    await sendEach(
      tx,
      ctx,
      broadcastTargets(ctx, reach),
      `closing:${payload.token}`,
      (target) => fixedContent("closing", wordingFor(ctx, target)),
    );
  }

  async function decision({ tx, ctx, reach, payload }: Turn) {
    if (!("appointmentId" in payload)) throw new JobError("invalid_payload");
    await appointmentDecision(
      tx,
      ctx,
      reach,
      payload.step,
      payload.appointmentId,
    );
  }

  /** Message écrit par l'équipe : confié à l'envoi, sauf accord retiré entre-temps. */
  async function deliver({ tx, ctx, reach, payload }: Turn) {
    if (!("messageId" in payload)) throw new JobError("invalid_payload");
    const [message] = await tx
      .select({
        id: messages.id,
        author: messages.author,
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
    await queueSend(tx, {
      organizationId: ctx.organizationId,
      followupId: ctx.followupId,
      threadId: message.threadId,
      id: message.id,
    });
  }

  /** Étape déclenchée par un message du propriétaire : message et auteur revérifiés. */
  function withSource(run: (turn: SourceTurn) => Promise<void>) {
    return async (turn: Turn) => {
      const { payload } = turn;
      if (!("messageId" in payload)) throw new JobError("invalid_payload");
      const source = await inbound(turn.tx, payload.messageId);
      if (source.followupId !== turn.ctx.followupId)
        throw new JobError("target_missing");
      const writer = turn.ctx.contacts.find(
        (contact) => contact.id === source.followupContactId,
      );
      if (!writer) throw new JobError("target_missing");
      await run({
        ...turn,
        source,
        writer,
        key: `${payload.step}:${source.id}`,
      });
    };
  }

  /** Message fixe à l'auteur, en direct : accusé de STOP, rappel d'accord, etc. */
  function acknowledge(step: FixedStep) {
    return async ({ tx, ctx, writer, key }: SourceTurn) => {
      await sendNuma(
        tx,
        ctx,
        direct(writer),
        key,
        fixedContent(step, wordingFor(ctx, direct(writer))),
      );
    };
  }

  /** Consignes d'urgence, puis Numa poursuit la discussion si elle a la main. */
  async function urgent(turn: SourceTurn) {
    const { tx, ctx, reach, writer, source, key } = turn;
    // Après un STOP, rien ne part ; l'équipe a déjà été alertée.
    if (reach.consents.get(writer.id)?.state === "withdrawn") return;
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
    const reply = await numaTarget(tx, ctx, reach, writer, source);
    if (reply) await respond(turn, reply);
  }

  /** Message, photo ou fichier refusé : réponse, sauf reprise en main, pause, arrêt ou STOP. */
  async function answer(turn: SourceTurn) {
    const { tx, ctx, reach, writer, source, key, payload } = turn;
    const target = await numaTarget(tx, ctx, reach, writer, source);
    if (!target) return;
    if (payload.step === "photo_received" || payload.step === "file_refused")
      await sendNuma(
        tx,
        ctx,
        target,
        key,
        fixedContent(payload.step, wordingFor(ctx, target)),
      );
    else await respond(turn, target);
  }

  async function consentStep({
    tx,
    ctx,
    reach,
    writer,
    key,
    payload,
  }: SourceTurn) {
    if (payload.step !== "consent_given" && payload.step !== "resumed")
      throw new JobError("invalid_payload");
    await afterConsent(tx, ctx, reach, writer, payload.step, key);
  }

  async function leftGroup(turn: SourceTurn) {
    const { tx, ctx, writer } = turn;
    if (ctx.group) {
      const group = ctx.group;
      await groupCall(tx, (connector) =>
        connector.removeFromGroup({
          groupRef: group.externalRef,
          member: writer.phone,
          idempotencyKey: `group-leave:${group.id}:${writer.id}`,
        }),
      );
      const leaver = firstName(writer.ownerFullName);
      if (groupMembers(ctx).length === 0)
        await closeGroup(tx, ctx, group, {
          code: "group_emptied",
          names: [leaver],
        });
      else
        await systemNote(tx, ctx, group.id, {
          code: "left_group",
          names: [leaver],
        });
    }
    await acknowledge("left_group")(turn);
  }

  async function stoppedAll(turn: SourceTurn) {
    const { tx, ctx, reach, writer, key } = turn;
    if (ctx.group)
      await closeGroup(tx, ctx, ctx.group, {
        code: "group_stopped",
        names: [firstName(writer.ownerFullName)],
      });
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
          fixedContent(
            "stopped_by_other",
            wordingFor(ctx, direct(other), writer),
          ),
        );
    await acknowledge("stopped_all")(turn);
  }

  /** Une fonction par étape (`followup.message`). */
  const STEPS: Record<JobPayload["step"], (turn: Turn) => Promise<void>> = {
    intro,
    closing,
    appointment_confirmed: decision,
    appointment_declined: decision,
    deliver,
    urgent: withSource(urgent),
    reply: withSource(answer),
    photo_received: withSource(answer),
    file_refused: withSource(answer),
    consent_given: withSource(consentStep),
    resumed: withSource(consentStep),
    // Toujours en attente d'accord : sinon le rappel ne part plus.
    consent_reminder: withSource(async (turn) => {
      if (turn.reach.consents.get(turn.writer.id)?.state === "requested")
        await acknowledge("consent_reminder")(turn);
    }),
    // Réponse déjà donnée entre-temps : la question ne part plus.
    stop_clarify: withSource(async (turn) => {
      if (turn.writer.stopRequestedAt) await acknowledge("stop_clarify")(turn);
    }),
    left_group: withSource(leftGroup),
    stopped_all: withSource(stoppedAll),
    stopped: withSource(acknowledge("stopped")),
  };

  /** Suivi de la tâche, verrouillé ou non ; disparu entre-temps : la tâche est sans objet. */
  async function conversationOf(
    tx: TenantTransaction,
    followupId: string | null,
    lock: boolean,
  ) {
    if (!followupId) throw new JobError("target_missing");
    try {
      return await loadContext(tx, followupId, lock);
    } catch (error) {
      if (error instanceof DomainError) throw new JobError("target_missing");
      throw error;
    }
  }

  /**
   * Demandes à faire à l'IA pour cette tâche, lues sans verrou ni écriture : un message
   * auquel Numa répondra elle-même (ni rendez-vous, ni réponse déjà donnée).
   */
  async function replyRequests(
    tx: TenantTransaction,
    job: ClaimedJob,
  ): Promise<NumaReplyInput[]> {
    const parsed = jobPayload.safeParse(job.payload);
    if (!parsed.success || !("messageId" in parsed.data)) return [];
    const { step, messageId } = parsed.data;
    if (step !== "reply" && step !== "urgent") return [];
    const ctx = await conversationOf(tx, job.followupId, false);
    if (ctx.isTest) return [];
    const reach = await reachOf(tx, ctx);
    const source = await inbound(tx, messageId);
    const writer = ctx.contacts.find(
      (contact) => contact.id === source.followupContactId,
    );
    if (source.followupId !== ctx.followupId || !writer) return [];
    if (
      step === "urgent" &&
      reach.consents.get(writer.id)?.state === "withdrawn"
    )
      return [];
    const target = await numaTarget(tx, ctx, reach, writer, source);
    if (!target) return [];
    const plan = await replyPlan(tx, ctx, target, source, false);
    return plan.kind === "ai" ? [plan.input] : [];
  }

  /**
   * Tâche `followup.message`, en deux temps (ADR 0040) : la réponse de l'IA est rédigée hors
   * transaction ; puis, sous le verrou du suivi, l'état est revérifié et l'étape écrite.
   * Un deuxième message du propriétaire n'attend donc jamais l'IA.
   */
  const message: StagedJobHandler<Drafts<NumaReply>> = {
    async prepare({ job, read }) {
      const asks = await read((tx) => replyRequests(tx, job));
      return draftAll(asks, (input) => ai.numaReply(input));
    },
    async commit({ tx, job, prepared }) {
      const parsed = jobPayload.safeParse(job.payload);
      if (!parsed.success) throw new JobError("invalid_payload");
      const ctx = await conversationOf(tx, job.followupId, true);
      // Un suivi test n'envoie jamais rien.
      if (ctx.isTest) return;
      if (ctx.contacts.length === 0) throw new JobError("target_missing");
      await STEPS[parsed.data.step]({
        tx,
        ctx,
        reach: await reachOf(tx, ctx),
        payload: parsed.data,
        replies: prepared,
      });
    },
  };

  /** Étape programmée encore à envoyer, avec ses destinataires ; null : rien ne part. */
  async function reminderStep(
    tx: TenantTransaction,
    job: ClaimedJob,
    lock: boolean,
  ) {
    const parsed = reminderPayload.safeParse(job.payload);
    if (!parsed.success) throw new JobError("invalid_payload");
    const ctx = await conversationOf(tx, job.followupId, lock);
    if (ctx.isTest) return null;
    if (ctx.contacts.length === 0) throw new JobError("target_missing");
    // En pause, repris en main ou terminé : l'étape ne part pas, et ne repartira pas.
    if (ctx.status !== "active") return null;
    const targets = broadcastTargets(ctx, await reachOf(tx, ctx));
    if (targets.length === 0) return null;
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
    if (step.supersededAt) return null;
    const requests = new Map<"fr" | "en", NumaStepInput>();
    for (const target of targets) {
      const { language } = wordingFor(ctx, target);
      requests.set(language, {
        language,
        animalName: ctx.animalName,
        practiceName: ctx.practiceName,
        kind: step.kind,
        instruction: step.content,
        controlAppointmentAt: step.controlAppointmentAt,
      });
    }
    return { ctx, targets, step, requests };
  }

  /**
   * Étape programmée de la fiche (`followup.reminder`, lot 15) : rédigée par Numa d'après la
   * consigne validée par le vétérinaire (hors transaction), filtrée par les garde-fous. Elle
   * ne part que si le suivi est actif, l'accord donné et l'étape toujours dans la fiche ; au
   * groupe s'il existe.
   */
  const reminder: StagedJobHandler<Drafts<{ text: string }>> = {
    async prepare({ job, read }) {
      const due = await read((tx) => reminderStep(tx, job, false));
      return draftAll(due ? [...due.requests.values()] : [], (input) =>
        ai.numaStep(input),
      );
    },
    async commit({ tx, job, prepared }) {
      const due = await reminderStep(tx, job, true);
      if (!due) return;
      const { ctx, targets, step } = due;
      const texts = new Map<string, string | null>();
      for (const [language, input] of due.requests) {
        const draft = drafted(prepared, input);
        if (!draft) {
          // Fournisseur en panne : la prise de nouvelles fixe part à la place (ADR 0026).
          await audit(
            tx,
            systemAuthor(ctx.organizationId),
            "numa.ai_unavailable",
            ctx.followupId,
          );
          texts.set(language, null);
          continue;
        }
        const verdict = checkNumaReply(draft.text);
        if (!verdict.ok)
          await audit(
            tx,
            systemAuthor(ctx.organizationId),
            "numa.reply_blocked",
            ctx.followupId,
            { reason: verdict.reason },
          );
        texts.set(language, verdict.ok ? draft.text : null);
      }
      await sendEach(tx, ctx, targets, `step:${step.id}`, (target) =>
        stepContent(
          tx,
          ctx,
          target,
          texts.get(wordingFor(ctx, target).language),
        ),
      );
    },
  };

  /**
   * Étape rédigée : en texte libre si le propriétaire a écrit depuis moins de 24 h, sinon
   * dans le modèle `suivi_rappel` (ADR 0024). Trop longue pour le modèle, elle attendra sa
   * prochaine réponse ; refusée par les garde-fous, la prise de nouvelles fixe la remplace.
   */
  async function stepContent(
    tx: TenantTransaction,
    ctx: ConversationContext,
    target: Target,
    draft: string | null | undefined,
  ): Promise<NumaContent> {
    const wording = wordingFor(ctx, target);
    if (!draft) return fixedContent("check_in", wording);
    const open = await freeTextAllowed(
      tx,
      target.kind === "group"
        ? { followupId: ctx.followupId }
        : { phone: target.contact.phone },
    );
    if (open) return draft;
    const wrapped = renderTemplate("suivi_rappel", wording.language, {
      first_name: wording.ownerFirstName,
      animal: ctx.animalName,
      practice: ctx.practiceName,
      message: draft,
    });
    return wrapped.body.length <= TEMPLATE_BODY_MAX ? wrapped : draft;
  }

  return { "followup.message": message, [REMINDER_KIND]: reminder };
}
