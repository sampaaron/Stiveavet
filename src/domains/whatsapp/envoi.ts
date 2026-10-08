import { and, desc, eq, gt, inArray, max, sql } from "drizzle-orm";
import { z } from "zod";

import { WhatsAppSendError } from "@/adapters/whatsapp/types";
import type {
  OutboundContent,
  Recipient,
  SendFailure,
} from "@/adapters/whatsapp/types";
import { firstName } from "@/domains/conversations/wording";
import { JobError } from "@/domains/taches/kinds";
import type { JobErrorCode } from "@/domains/taches/kinds";
import { enqueue } from "@/domains/taches/queue";
import type { DeadJobHandler, JobHandler } from "@/domains/taches/worker";
import {
  animals,
  consents,
  conversationThreads,
  followupContacts,
  followups,
  messages,
  organizations,
  ownerContacts,
  owners,
  scheduledJobs,
} from "@/server/db/schema";
import type { TenantTransaction } from "@/server/db/tenant";

import type { WhatsAppProvider } from "./connexion";
import { fillTemplate, isTemplateKey, renderTemplate } from "./modeles";

/**
 * Envoi d'un message WhatsApp (architecture §9, ADR 0024) : une tâche par message, un seul
 * appel à Meta par tentative. Au moment d'envoyer, la tâche revérifie tout :
 * - accord retiré après l'écriture du message : rien ne part ;
 * - modèle du catalogue : il part tel quel, fenêtre ouverte ou non ;
 * - texte libre, fenêtre de 24 h ouverte : il part ;
 * - texte libre, fenêtre fermée : il attend la prochaine réponse du propriétaire, et une
 *   invitation à répondre (modèle, sans contenu clinique) part à sa place.
 * Un échec définitif met la tâche en échec tout de suite et prévient le vétérinaire (§15).
 */

export const SEND_JOB = "whatsapp.send";
export const FAILURE_EMAIL_JOB = "notify.whatsapp_failed";

/** Marge sous les 24 h de Meta : un envoi qui traîne dans la file ne tombe pas hors fenêtre. */
const WINDOW_MS = 23 * 3_600_000 + 30 * 60_000;

const sendPayload = z.object({ messageId: z.uuid(), threadId: z.uuid() });

/** Échecs après lesquels un administrateur peut relancer l'envoi depuis « Tâches en échec ». */
const RESENDABLE = new Set([
  "whatsapp_rejected",
  "whatsapp_unreachable",
  "whatsapp_failed",
  "whatsapp_account",
  "whatsapp_unavailable",
]);

/**
 * Inscrit l'envoi d'un message ; `attempt` distingue un nouvel envoi (message libéré).
 * Dans une même conversation, chaque envoi est prévu au moins une milliseconde après le
 * précédent encore en attente : la file les prend dans l'ordre où ils ont été écrits.
 */
export async function queueSend(
  tx: TenantTransaction,
  message: {
    organizationId: string;
    followupId: string;
    threadId: string;
    id: string;
  },
  attempt = "first",
) {
  const [last] = await tx
    .select({ at: max(scheduledJobs.runAt) })
    .from(scheduledJobs)
    .where(
      and(
        eq(scheduledJobs.kind, SEND_JOB),
        eq(scheduledJobs.status, "pending"),
        sql`${scheduledJobs.payload} ->> 'threadId' = ${message.threadId}`,
      ),
    );
  const now = new Date();
  const runAt =
    last?.at && last.at.getTime() >= now.getTime()
      ? new Date(last.at.getTime() + 1)
      : now;
  await enqueue(tx, {
    organizationId: message.organizationId,
    kind: SEND_JOB,
    idempotencyKey: `whatsapp:send:${message.id}:${attempt}`,
    runAt,
    followupId: message.followupId,
    payload: { messageId: message.id, threadId: message.threadId },
  });
}

/** Téléphone d'un contact de suivi (numéro WhatsApp choisi pour ce suivi). */
async function contactPhone(tx: TenantTransaction, contactId: string) {
  const [row] = await tx
    .select({ phone: ownerContacts.value })
    .from(followupContacts)
    .innerJoin(
      ownerContacts,
      eq(ownerContacts.id, followupContacts.ownerContactId),
    )
    .where(eq(followupContacts.id, contactId));
  return row?.phone ?? null;
}

/**
 * Dernier message reçu de ce numéro, tous suivis du cabinet confondus : la fenêtre de Meta
 * est ouverte entre le numéro du cabinet et la personne, pas par suivi.
 */
async function lastInboundFrom(tx: TenantTransaction, phone: string) {
  const [row] = await tx
    .select({ at: max(messages.occurredAt) })
    .from(messages)
    .innerJoin(
      followupContacts,
      eq(followupContacts.id, messages.followupContactId),
    )
    .innerJoin(
      ownerContacts,
      eq(ownerContacts.id, followupContacts.ownerContactId),
    )
    .where(
      and(eq(messages.direction, "inbound"), eq(ownerContacts.value, phone)),
    );
  return row?.at ?? null;
}

/** Groupe (simulé) : la fenêtre suit le dernier message d'un des propriétaires du suivi. */
async function lastInboundInFollowup(
  tx: TenantTransaction,
  followupId: string,
) {
  const [row] = await tx
    .select({ at: max(messages.occurredAt) })
    .from(messages)
    .where(
      and(
        eq(messages.followupId, followupId),
        eq(messages.direction, "inbound"),
      ),
    );
  return row?.at ?? null;
}

function windowOpen(lastInbound: Date | null, now: Date): boolean {
  return (
    lastInbound !== null && now.getTime() - lastInbound.getTime() < WINDOW_MS
  );
}

/** Fenêtre de 24 h ouverte avec ce numéro (ou dans le groupe du suivi) : texte libre possible. */
export async function freeTextAllowed(
  tx: TenantTransaction,
  to: { phone: string } | { followupId: string },
  now: Date = new Date(),
): Promise<boolean> {
  const last =
    "phone" in to
      ? await lastInboundFrom(tx, to.phone)
      : await lastInboundInFollowup(tx, to.followupId);
  return windowOpen(last, now);
}

/** Accord retiré par ce contact après l'écriture du message : le message ne part pas. */
async function withdrawnSince(
  tx: TenantTransaction,
  contactId: string,
  since: Date,
): Promise<boolean> {
  const [latest] = await tx
    .select({ state: consents.state, at: consents.recordedAt })
    .from(consents)
    .where(eq(consents.followupContactId, contactId))
    .orderBy(desc(consents.recordedAt))
    .limit(1);
  return latest?.state === "withdrawn" && latest.at > since;
}

/**
 * Échecs définitifs de Meta. Une tâche qui échoue annule tout ce qu'elle a écrit : c'est
 * l'exécutant d'échec qui marque le message, d'après le code de la tâche.
 */
const FINAL_FAILURES: Record<
  Exclude<SendFailure, "retry" | "unknown" | "window_closed">,
  JobErrorCode
> = {
  unreachable: "recipient_unreachable",
  rejected: "provider_rejected",
  account: "provider_account",
};

/** Code d'échec du message selon celui de la tâche abandonnée. */
const MESSAGE_FAILURES: Partial<Record<JobErrorCode, string>> = {
  recipient_unreachable: "whatsapp_unreachable",
  provider_rejected: "whatsapp_rejected",
  provider_account: "whatsapp_account",
  provider_unavailable: "whatsapp_unavailable",
};

/**
 * Invitation à répondre, à la place d'un message qui attend (fenêtre fermée) : une seule par
 * contact entre deux réponses du propriétaire.
 */
async function inviteToReply(
  tx: TenantTransaction,
  held: { organizationId: string; followupId: string; threadId: string },
  contactId: string,
  phone: string,
) {
  const [lastReply] = await tx
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.followupContactId, contactId),
        eq(messages.direction, "inbound"),
      ),
    )
    .orderBy(desc(messages.occurredAt))
    .limit(1);
  const [context] = await tx
    .select({
      ownerName: owners.fullName,
      language: followupContacts.language,
      animalName: animals.name,
      practiceName: organizations.name,
    })
    .from(followupContacts)
    .innerJoin(owners, eq(owners.id, followupContacts.ownerId))
    .innerJoin(followups, eq(followups.id, followupContacts.followupId))
    .innerJoin(animals, eq(animals.id, followups.animalId))
    .innerJoin(organizations, eq(organizations.id, followups.organizationId))
    .where(eq(followupContacts.id, contactId));
  if (!context || !phone) return;
  const invite = renderTemplate("message_en_attente", context.language, {
    first_name: firstName(context.ownerName),
    practice: context.practiceName,
    animal: context.animalName,
  });
  const [created] = await tx
    .insert(messages)
    .values({
      organizationId: held.organizationId,
      followupId: held.followupId,
      threadId: held.threadId,
      direction: "outbound",
      author: "numa",
      followupContactId: contactId,
      body: invite.body,
      language: context.language,
      deliveryStatus: "queued",
      idempotencyKey: `invite:${contactId}:${lastReply?.id ?? "aucune"}`,
      templateKey: invite.key,
      templateParams: invite.params,
      occurredAt: sql`clock_timestamp()`,
    })
    .onConflictDoNothing({
      target: [messages.organizationId, messages.idempotencyKey],
    })
    .returning({ id: messages.id });
  if (created) await queueSend(tx, { ...held, id: created.id });
}

/**
 * Le propriétaire vient d'écrire : sa fenêtre est rouverte, les messages qui l'attendaient
 * partent (même numéro, tous suivis du cabinet ; et ceux du groupe où il a écrit).
 */
export async function releaseHeld(
  tx: TenantTransaction,
  inbound: { id: string; threadId: string; followupContactId: string },
) {
  const phone = await contactPhone(tx, inbound.followupContactId);
  const sameNumber = phone
    ? tx
        .select({ id: followupContacts.id })
        .from(followupContacts)
        .innerJoin(
          ownerContacts,
          eq(ownerContacts.id, followupContacts.ownerContactId),
        )
        .where(eq(ownerContacts.value, phone))
    : null;
  const held = await tx
    .select({
      id: messages.id,
      organizationId: messages.organizationId,
      followupId: messages.followupId,
      threadId: messages.threadId,
      followupContactId: messages.followupContactId,
    })
    .from(messages)
    .where(eq(messages.deliveryStatus, "awaiting_reply"))
    .orderBy(messages.occurredAt);
  const allowed = new Set(
    sameNumber ? (await sameNumber).map((row) => row.id) : [],
  );
  for (const message of held) {
    const mine =
      message.threadId === inbound.threadId ||
      (message.followupContactId !== null &&
        allowed.has(message.followupContactId));
    if (!mine) continue;
    await tx
      .update(messages)
      .set({ deliveryStatus: "queued" })
      .where(
        and(
          eq(messages.id, message.id),
          eq(messages.deliveryStatus, "awaiting_reply"),
        ),
      );
    await queueSend(tx, message, `release:${inbound.id}`);
  }
}

export function sendHandlers(deps: {
  whatsapp: WhatsAppProvider;
  clock?: () => Date;
}): {
  handlers: Record<string, JobHandler>;
  dead: Record<string, DeadJobHandler>;
} {
  const { whatsapp, clock = () => new Date() } = deps;

  async function markFailed(
    tx: TenantTransaction,
    messageId: string,
    errorCode: string,
  ) {
    await tx
      .update(messages)
      .set({ deliveryStatus: "failed", failedAt: clock(), errorCode })
      .where(eq(messages.id, messageId));
  }

  const send: JobHandler = async ({ tx, job }) => {
    const parsed = sendPayload.safeParse(job.payload);
    if (!parsed.success) throw new JobError("invalid_payload");
    const [message] = await tx
      .select({
        id: messages.id,
        organizationId: messages.organizationId,
        followupId: messages.followupId,
        threadId: messages.threadId,
        contactId: messages.followupContactId,
        direction: messages.direction,
        body: messages.body,
        language: messages.language,
        status: messages.deliveryStatus,
        errorCode: messages.errorCode,
        templateKey: messages.templateKey,
        templateParams: messages.templateParams,
        occurredAt: messages.occurredAt,
        threadKind: conversationThreads.kind,
        groupRef: conversationThreads.externalRef,
        threadClosedAt: conversationThreads.closedAt,
      })
      .from(messages)
      .innerJoin(
        conversationThreads,
        eq(conversationThreads.id, messages.threadId),
      )
      .where(eq(messages.id, parsed.data.messageId))
      // La conversation aussi : deux envois d'une même conversation ne se croisent pas.
      .for("update", { of: [messages, conversationThreads] });
    if (!message || message.direction !== "outbound")
      throw new JobError("target_missing");
    const resend =
      message.status === "failed" &&
      message.errorCode !== null &&
      RESENDABLE.has(message.errorCode);
    // Déjà parti (accusé reçu entre-temps), en attente, annulé : rien à faire.
    if (message.status !== "queued" && !resend) return;
    const now = clock();

    let to: Recipient;
    let lastInbound: Date | null;
    if (message.threadKind === "group") {
      if (!message.groupRef || message.threadClosedAt) {
        await markFailed(tx, message.id, "group_closed");
        return;
      }
      to = { kind: "group", groupRef: message.groupRef };
      lastInbound = await lastInboundInFollowup(tx, message.followupId);
    } else {
      const phone = message.contactId
        ? await contactPhone(tx, message.contactId)
        : null;
      if (!phone || !message.contactId) throw new JobError("target_missing");
      if (await withdrawnSince(tx, message.contactId, message.occurredAt)) {
        await markFailed(tx, message.id, "consent_withdrawn");
        return;
      }
      to = { kind: "phone", phone };
      lastInbound = await lastInboundFrom(tx, phone);
    }

    const template =
      message.templateKey && isTemplateKey(message.templateKey)
        ? message.templateKey
        : null;
    const language = message.language ?? "fr";
    if (
      template &&
      fillTemplate(template, language, message.templateParams) !== message.body
    )
      // Le texte gardé doit être exactement celui qui part.
      throw new JobError("invalid_payload", { final: true });

    const hold = async () => {
      await tx
        .update(messages)
        .set({ deliveryStatus: "awaiting_reply" })
        .where(eq(messages.id, message.id));
      if (to.kind === "phone" && message.contactId)
        await inviteToReply(tx, message, message.contactId, to.phone);
    };

    if (!template && !windowOpen(lastInbound, now)) {
      await hold();
      return;
    }
    const content: OutboundContent = template
      ? {
          kind: "template",
          key: template,
          language,
          params: message.templateParams,
        }
      : { kind: "text", body: message.body };

    let externalRef: string;
    try {
      const connector = await whatsapp.connectorFor(tx);
      ({ externalRef } = await connector.send({
        to,
        content,
        reference: message.id,
      }));
    } catch (error) {
      if (!(error instanceof WhatsAppSendError))
        throw new JobError("provider_unavailable");
      switch (error.failure) {
        case "retry":
        case "unknown":
          // Réponse perdue (`unknown`) : l'envoi a pu partir. La tentative suivante ne
          // renvoie que si aucun accusé de Meta n'a fait avancer le message entre-temps.
          throw new JobError("provider_unavailable");
        case "window_closed":
          if (!template) {
            await hold();
            return;
          }
          throw new JobError("provider_rejected", { final: true });
        default:
          throw new JobError(FINAL_FAILURES[error.failure], { final: true });
      }
    }
    await tx
      .update(messages)
      .set({
        deliveryStatus: "sent",
        sentAt: now,
        externalRef,
        failedAt: null,
        errorCode: null,
      })
      .where(eq(messages.id, message.id));
  };

  /** Envoi abandonné : le message est marqué en échec et le vétérinaire est prévenu (§15). */
  const sendDead: DeadJobHandler = async ({ tx, job, code }) => {
    const parsed = sendPayload.safeParse(job.payload);
    if (!parsed.success) return;
    await tx
      .update(messages)
      .set({
        deliveryStatus: "failed",
        failedAt: clock(),
        errorCode: MESSAGE_FAILURES[code] ?? "whatsapp_failed",
      })
      .where(
        and(
          eq(messages.id, parsed.data.messageId),
          inArray(messages.deliveryStatus, ["queued", "failed"]),
        ),
      );
    await notifyFailure(tx, {
      organizationId: job.organizationId,
      followupId: job.followupId,
      at: clock(),
    });
  };

  return { handlers: { [SEND_JOB]: send }, dead: { [SEND_JOB]: sendDead } };
}

/**
 * E-mail au vétérinaire responsable du suivi (cahier des charges §15) : au plus un par heure
 * et par vétérinaire, qui renvoie vers Stivea Vet. Aucun contenu clinique.
 */
export async function notifyFailure(
  tx: TenantTransaction,
  failure: { organizationId: string; followupId: string | null; at: Date },
) {
  if (!failure.followupId) return;
  const [followup] = await tx
    .select({ membershipId: followups.responsibleMembershipId })
    .from(followups)
    .where(eq(followups.id, failure.followupId));
  if (!followup) return;
  const hour = failure.at.toISOString().slice(0, 13);
  await enqueue(tx, {
    organizationId: failure.organizationId,
    kind: FAILURE_EMAIL_JOB,
    idempotencyKey: `notify:whatsapp-failed:${followup.membershipId}:${hour}`,
    runAt: failure.at,
    followupId: failure.followupId,
    payload: { membershipId: followup.membershipId },
  });
}

/** Messages en échec des suivis d'un vétérinaire : seuls les identifiants des suivis sortent. */
export async function failedSendsFor(
  tx: TenantTransaction,
  membershipId: string,
  since: Date,
) {
  return tx
    .select({ id: messages.id, followupId: messages.followupId })
    .from(messages)
    .innerJoin(followups, eq(followups.id, messages.followupId))
    .where(
      and(
        eq(followups.responsibleMembershipId, membershipId),
        eq(messages.deliveryStatus, "failed"),
        gt(messages.failedAt, since),
        // Pas les messages retenus volontairement (accord retiré, groupe fermé).
        inArray(messages.errorCode, [...RESENDABLE]),
      ),
    );
}
