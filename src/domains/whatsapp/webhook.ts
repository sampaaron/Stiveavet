import { createHmac, timingSafeEqual } from "node:crypto";

import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";

import { classifyGraphError } from "@/adapters/whatsapp/cloud-api";
import { receiveInTx } from "@/domains/conversations/service";
import { DomainError } from "@/domains/equipe/actor";
import {
  followupContacts,
  followups,
  messages,
  notificationDeliveries,
  ownerContacts,
  scheduledJobs,
  webhookEvents,
} from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import type { Database, TenantTransaction } from "@/server/db/tenant";

import { SEND_JOB, notifyFailure } from "./envoi";

/**
 * Webhook de la WhatsApp Cloud API (ADR 0024). Meta signe chaque envoi avec le secret de
 * l'application et le rejoue jusqu'à sept jours tant qu'il n'a pas reçu 200 :
 * - la signature est vérifiée sur le corps brut, avant toute lecture ;
 * - le cabinet se déduit du numéro Meta destinataire, jamais d'une donnée du message ;
 * - chaque message et chaque accusé n'est traité qu'une fois (`webhook_events`) ;
 * - un accusé ne fait qu'avancer l'état d'un message (envoyé, reçu, lu), sauf l'échec, qui
 *   remet la tâche d'envoi en échec et prévient le vétérinaire (§15).
 * Rien du contenu, du numéro ou du jeton n'est journalisé.
 */

export const WEBHOOK_MAX_BYTES = 1_000_000;

/** En-tête `X-Hub-Signature-256` : HMAC-SHA256 du corps brut avec le secret de l'application. */
export function validSignature(
  body: Uint8Array,
  header: string | null,
  appSecret: string,
): boolean {
  const match = /^sha256=([0-9a-f]{64})$/.exec(header ?? "");
  if (!match?.[1]) return false;
  const expected = createHmac("sha256", appSecret).update(body).digest();
  const received = Buffer.from(match[1], "hex");
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}

/** Vérification de l'abonnement (GET) : le défi n'est renvoyé qu'avec le bon jeton. */
export function verificationChallenge(
  params: URLSearchParams,
  verifyToken: string,
): string | null {
  const token = Buffer.from(params.get("hub.verify_token") ?? "");
  const expected = Buffer.from(verifyToken);
  const challenge = params.get("hub.challenge") ?? "";
  if (
    params.get("hub.mode") !== "subscribe" ||
    token.length !== expected.length ||
    !timingSafeEqual(token, expected) ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(challenge)
  )
    return null;
  return challenge;
}

const wamid = z
  .string()
  .min(8)
  .max(300)
  .regex(/^[A-Za-z0-9:._=+/-]+$/);
const timestamp = z.string().regex(/^[0-9]{1,12}$/);

const inbound = z.object({
  id: wamid,
  from: z
    .string()
    .regex(/^[0-9]{6,15}$/)
    .optional(),
  from_user_id: z
    .string()
    .regex(/^[A-Z]{2}\.[0-9]{5,40}$/)
    .optional(),
  timestamp,
  type: z.string().max(40),
  context: z.object({ id: wamid }).partial().optional(),
  text: z.object({ body: z.string() }).optional(),
  button: z.object({ text: z.string() }).optional(),
  interactive: z
    .object({
      button_reply: z.object({ title: z.string() }).optional(),
      list_reply: z.object({ title: z.string() }).optional(),
    })
    .optional(),
});

const status = z.object({
  id: wamid,
  status: z.string().max(40),
  timestamp,
  biz_opaque_callback_data: z.string().max(512).optional(),
  errors: z.array(z.object({ code: z.number().int() })).optional(),
});

const change = z.object({
  field: z.string(),
  value: z
    .object({
      metadata: z.object({ phone_number_id: z.string().max(30) }),
      contacts: z
        .array(
          z.object({
            wa_id: z.string().optional(),
            user_id: z.string().optional(),
          }),
        )
        .optional(),
      messages: z.array(z.unknown()).optional(),
      statuses: z.array(z.unknown()).optional(),
    })
    .optional(),
});

export const webhookPayload = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(z.object({ changes: z.array(z.unknown()).max(100) })).max(100),
});

type Inbound = z.infer<typeof inbound>;
type Status = z.infer<typeof status>;

/** Texte écrit par le propriétaire ; photos et vocaux arrivent au lot 22. */
function inboundText(message: Inbound): string | null {
  const text =
    message.text?.body ??
    message.button?.text ??
    message.interactive?.button_reply?.title ??
    message.interactive?.list_reply?.title ??
    null;
  const trimmed = text?.trim().slice(0, 4096) ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function atOf(value: string, now: Date): Date {
  const at = new Date(Number(value) * 1000);
  return at.getTime() > now.getTime() ? now : at;
}

/** Garde un événement une seule fois ; faux s'il a déjà été traité. */
async function firstTime(
  tx: TenantTransaction,
  organizationId: string,
  eventKey: string,
  kind: string,
): Promise<boolean> {
  const inserted = await tx
    .insert(webhookEvents)
    .values({ organizationId, provider: "whatsapp", eventKey, kind })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  return inserted.length > 0;
}

/**
 * Suivi auquel appartient un message reçu : celui du message auquel il répond, sinon le
 * suivi le plus récemment actif avec ce contact (un propriétaire peut suivre deux animaux).
 */
async function routeInbound(
  tx: TenantTransaction,
  message: Inbound,
): Promise<{ followupId: string; role: "primary" | "secondary" } | null> {
  const phone = message.from ? `+${message.from}` : null;
  const sender = or(
    phone ? eq(ownerContacts.value, phone) : sql`false`,
    message.from_user_id
      ? eq(ownerContacts.whatsappUserId, message.from_user_id)
      : sql`false`,
  );
  // Dernier échange avec ce contact dans ce suivi.
  const lastActivity = sql`(SELECT max(m.occurred_at) FROM messages m WHERE m.followup_contact_id = ${followupContacts.id})`;
  const candidates = await tx
    .select({
      contactId: followupContacts.id,
      followupId: followupContacts.followupId,
      role: followupContacts.role,
      ownerContactId: ownerContacts.id,
      userId: ownerContacts.whatsappUserId,
    })
    .from(followupContacts)
    .innerJoin(
      ownerContacts,
      eq(ownerContacts.id, followupContacts.ownerContactId),
    )
    .innerJoin(followups, eq(followups.id, followupContacts.followupId))
    .where(
      and(
        sender,
        eq(followupContacts.active, true),
        eq(followups.isTest, false),
        inArray(followups.status, [
          "active",
          "paused",
          "human_takeover",
          "ended",
        ]),
      ),
    )
    .orderBy(sql`${lastActivity} DESC NULLS LAST`, desc(followups.startedAt));
  if (candidates.length === 0) return null;
  let chosen = candidates[0];
  if (message.context?.id) {
    const [replied] = await tx
      .select({ contactId: messages.followupContactId })
      .from(messages)
      .where(eq(messages.externalRef, message.context.id));
    chosen =
      candidates.find((row) => row.contactId === replied?.contactId) ?? chosen;
  }
  if (!chosen) return null;
  // Identifiant WhatsApp propre au cabinet : il servira quand le numéro manquera.
  if (message.from_user_id && !chosen.userId)
    await tx
      .update(ownerContacts)
      .set({ whatsappUserId: message.from_user_id })
      .where(eq(ownerContacts.id, chosen.ownerContactId));
  return { followupId: chosen.followupId, role: chosen.role };
}

const ADVANCE = { sent: "sent", delivered: "delivered", read: "read" } as const;

const STEP: Record<string, number> = {
  queued: 0,
  awaiting_reply: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

async function applyStatus(
  tx: TenantTransaction,
  organizationId: string,
  event: Status,
  now: Date,
) {
  const at = atOf(event.timestamp, now);
  const reference = z.uuid().safeParse(event.biz_opaque_callback_data);
  const byRef = reference.success
    ? or(eq(messages.externalRef, event.id), eq(messages.id, reference.data))
    : eq(messages.externalRef, event.id);
  const [message] = await tx
    .select({
      id: messages.id,
      followupId: messages.followupId,
      status: messages.deliveryStatus,
      externalRef: messages.externalRef,
    })
    .from(messages)
    .where(and(byRef, eq(messages.direction, "outbound")))
    .for("update");
  if (message) {
    const current = STEP[message.status ?? ""] ?? -1;
    if (event.status === "failed") {
      // Déjà remis : un échec tardif ne change rien.
      if (current >= STEP.delivered!) return;
      const failure = classifyGraphError(event.errors?.[0]?.code ?? -1);
      const unreachable = failure === "unreachable";
      await tx
        .update(messages)
        .set({
          deliveryStatus: "failed",
          failedAt: at,
          externalRef: message.externalRef ?? event.id,
          errorCode: unreachable ? "whatsapp_unreachable" : "whatsapp_failed",
        })
        .where(eq(messages.id, message.id));
      const [job] = await tx
        .select({ id: scheduledJobs.id })
        .from(scheduledJobs)
        .where(
          and(
            eq(scheduledJobs.kind, SEND_JOB),
            eq(scheduledJobs.status, "succeeded"),
            sql`${scheduledJobs.payload} ->> 'messageId' = ${message.id}`,
          ),
        )
        .limit(1);
      if (job)
        await tx.execute(
          sql`SELECT jobs.fail_after_success(${job.id}, ${unreachable ? "recipient_unreachable" : "provider_rejected"})`,
        );
      await notifyFailure(tx, {
        organizationId,
        followupId: message.followupId,
        at,
      });
      return;
    }
    const reached = Object.hasOwn(ADVANCE, event.status)
      ? ADVANCE[event.status as keyof typeof ADVANCE]
      : null;
    const next = reached ? STEP[reached] : undefined;
    if (!reached || next === undefined || next <= current) return;
    await tx
      .update(messages)
      .set({
        deliveryStatus: reached,
        externalRef: message.externalRef ?? event.id,
        // Marqué en échec à tort (réponse perdue) : Meta l'a bien remis.
        failedAt: null,
        errorCode: null,
        ...(next >= STEP.sent! && current < STEP.sent! ? { sentAt: at } : {}),
        ...(next >= STEP.delivered! ? { deliveredAt: at } : {}),
        ...(next === STEP.read ? { readAt: at } : {}),
      })
      .where(eq(messages.id, message.id));
    return;
  }
  // Alerte à un vétérinaire : remise ou échec seulement.
  const delivery = reference.success
    ? or(
        eq(notificationDeliveries.externalRef, event.id),
        eq(notificationDeliveries.id, reference.data),
      )
    : eq(notificationDeliveries.externalRef, event.id);
  if (event.status === "delivered" || event.status === "read")
    await tx
      .update(notificationDeliveries)
      .set({ status: "delivered" })
      .where(and(delivery, eq(notificationDeliveries.status, "sent")));
  else if (event.status === "failed")
    await tx
      .update(notificationDeliveries)
      .set({ status: "failed", failedAt: at, errorCode: "whatsapp_failed" })
      .where(
        and(
          delivery,
          inArray(notificationDeliveries.status, ["pending", "sent"]),
        ),
      );
}

export type WebhookResult = {
  messages: number;
  statuses: number;
  ignored: number;
};

/** Traite un corps déjà authentifié par sa signature. */
export async function handleWebhook(
  db: Database,
  payload: z.infer<typeof webhookPayload>,
  now: Date = new Date(),
): Promise<WebhookResult> {
  const result: WebhookResult = { messages: 0, statuses: 0, ignored: 0 };
  for (const entry of payload.entry)
    for (const raw of entry.changes) {
      const parsed = change.safeParse(raw);
      if (
        !parsed.success ||
        parsed.data.field !== "messages" ||
        !parsed.data.value
      ) {
        result.ignored += 1;
        continue;
      }
      const value = parsed.data.value;
      const routed = await db.execute<{ org: string | null }>(
        sql`SELECT app.whatsapp_organization(${value.metadata.phone_number_id}) AS org`,
      );
      const organizationId = routed.rows[0]?.org ?? null;
      // Numéro inconnu (déconnecté entre-temps) : accusé de réception sans traitement.
      if (!organizationId) {
        result.ignored += 1;
        continue;
      }
      await withTenant(db, { organizationId }, async (tx) => {
        for (const rawMessage of value.messages ?? []) {
          const message = inbound.safeParse(rawMessage);
          if (
            !message.success ||
            !(await firstTime(
              tx,
              organizationId,
              `msg:${message.data.id}`,
              "message",
            ))
          ) {
            result.ignored += 1;
            continue;
          }
          const body = inboundText(message.data);
          const target = body ? await routeInbound(tx, message.data) : null;
          if (!body || !target) {
            result.ignored += 1;
            continue;
          }
          try {
            // Point de sauvegarde : un message refusé n'annule pas les autres du lot.
            await tx.transaction((inner) =>
              receiveInTx(inner, target.followupId, body, target.role),
            );
            result.messages += 1;
          } catch (error) {
            if (!(error instanceof DomainError)) throw error;
            result.ignored += 1;
          }
        }
        for (const rawStatus of value.statuses ?? []) {
          const event = status.safeParse(rawStatus);
          if (
            !event.success ||
            !(await firstTime(
              tx,
              organizationId,
              `status:${event.data.id}:${event.data.status}`,
              "status",
            ))
          ) {
            result.ignored += 1;
            continue;
          }
          await applyStatus(tx, organizationId, event.data, now);
          result.statuses += 1;
        }
      });
    }
  return result;
}
