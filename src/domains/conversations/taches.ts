import { and, count, desc, eq, gt, sql } from "drizzle-orm";

import type { AiGateway, NumaIntent } from "@/adapters/ai-gateway/types";
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
import type { JobHandler } from "@/domains/taches/worker";
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

/**
 * Tâches `followup.message` : premier message, accusés de consentement, relance d'accord,
 * groupe, réponses de Numa, rendez-vous et envoi des messages écrits par l'équipe. Chaque cas
 * revérifie l'état au moment de l'envoi (pause, reprise en main, retrait d'accord, STOP dans
 * le groupe) : rien ne part à tort.
 */
export function conversationHandlers(deps: {
  whatsapp: WhatsAppProvider;
  ai: AiGateway;
}): Record<string, JobHandler> {
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
    let intent: NumaIntent = "ack";
    try {
      ({ text, intent } = await ai.numaReply({
        language,
        animalName: ctx.animalName,
        practiceName: ctx.practiceName,
        ownerMessage: source.body,
      }));
    } catch {
      // Fournisseur en panne ou réponse hors format : le propriétaire n'attend pas, il est
      // renvoyé vers l'équipe (ADR 0026). Le message reste lu par le vétérinaire.
      await audit(
        tx,
        systemAuthor(ctx.organizationId),
        "numa.ai_unavailable",
        ctx.followupId,
      );
      text = "";
    }
    // Hors simples nouvelles, Numa répond par un texte fixe validé, jamais par celui du modèle.
    if (text && intent !== "ack")
      text = numaFixedReply(intent, { ...ctx, language });
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
          fixedContent(
            pair
              ? whatsapp.groups
                ? "intro_pair"
                : "intro_separate"
              : "intro",
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
        (target) => fixedContent("closing", wordingFor(ctx, target)),
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
      await queueSend(tx, {
        organizationId: ctx.organizationId,
        followupId: ctx.followupId,
        threadId: message.threadId,
        id: message.id,
      });
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
      case "photo_received":
      case "file_refused": {
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
            fixedContent(payload.step, wordingFor(ctx, target)),
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
          const { externalRef } = ctx.group;
          await groupCall(tx, (connector) =>
            connector.removeFromGroup({
              groupRef: externalRef,
              member: writer.phone,
              idempotencyKey: `group-leave:${ctx.group?.id ?? ""}:${writer.id}`,
            }),
          );
          const leaver = firstName(writer.ownerFullName);
          if (groupMembers(ctx).length === 0)
            await closeGroup(tx, ctx, ctx.group, {
              code: "group_emptied",
              names: [leaver],
            });
          else
            await systemNote(tx, ctx, ctx.group.id, {
              code: "left_group",
              names: [leaver],
            });
        }
        break;
      }
      case "stopped_all": {
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
      fixedContent(step, wordingFor(ctx, direct(writer))),
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
    const drafts = new Map<string, string | null>();
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
        // Fournisseur en panne : la prise de nouvelles fixe part à la place (ADR 0026).
        await audit(
          tx,
          systemAuthor(ctx.organizationId),
          "numa.ai_unavailable",
          ctx.followupId,
        );
        drafts.set(wording.language, null);
        continue;
      }
      const verdict = checkNumaReply(text);
      if (!verdict.ok)
        await audit(
          tx,
          systemAuthor(ctx.organizationId),
          "numa.reply_blocked",
          ctx.followupId,
          { reason: verdict.reason },
        );
      drafts.set(wording.language, verdict.ok ? text : null);
    }
    await sendEach(tx, ctx, targets, `step:${step.id}`, (target) =>
      stepContent(
        tx,
        ctx,
        target,
        drafts.get(wordingFor(ctx, target).language),
      ),
    );
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

  return { "followup.message": handler, [REMINDER_KIND]: reminder };
}
