import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { stripeIds } from "@/adapters/stripe/api";
import { auditOrganization, systemAuthor } from "@/domains/audit/journal";
import {
  billingAccounts,
  integrationConnections,
  paymentEvents,
  webhookEvents,
} from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import type { Database, TenantTransaction } from "@/server/db/tenant";

import { settleInvoice } from "./paiements";
import type { PaymentOutcome } from "./paiements";

/**
 * Événements signés de Stripe (ADR 0027), reçus sans cabinet connu :
 * - l'identifiant Stripe (client, mandat, prélèvement) est relié au cabinet par une fonction
 *   étroite de la base, puis tout se fait sous la RLS de ce cabinet ;
 * - chaque événement n'est traité qu'une fois (`webhook_events`) : Stripe peut le rejouer ;
 * - un événement d'un type inconnu, ou relatif à un objet inconnu, est accusé sans effet.
 */

export const STRIPE_WEBHOOK_MAX_BYTES = 256_000;

export const stripeEvent = z.object({
  id: z.string().regex(/^evt_[A-Za-z0-9]{8,64}$/),
  type: z.string().max(80),
  data: z.object({ object: z.record(z.string(), z.unknown()) }),
});
export type StripeEvent = z.infer<typeof stripeEvent>;

const mandateSigned = z.object({
  customer: stripeIds.customer,
  payment_method: stripeIds.paymentMethod,
  mandate: stripeIds.mandate,
});
const mandateRevoked = z.object({
  id: stripeIds.mandate,
  status: z.string(),
});
const intentSettled = z.object({ id: stripeIds.paymentIntent });
const disputeOpened = z.object({ payment_intent: stripeIds.paymentIntent });

const OUTCOMES: Record<string, PaymentOutcome> = {
  "payment_intent.succeeded": "succeeded",
  "payment_intent.payment_failed": "failed",
  "charge.dispute.created": "disputed",
};

/** Ce que l'événement change, et l'identifiant qui désigne le cabinet. */
type Route =
  | { kind: "customer"; ref: string; apply: Apply }
  | { kind: "mandate"; ref: string; apply: Apply }
  | { kind: "payment"; ref: string; apply: Apply };
type Apply = (
  tx: TenantTransaction,
  organizationId: string,
  now: Date,
) => Promise<void>;

function route(event: StripeEvent): Route | null {
  const object = event.data.object;
  if (event.type === "setup_intent.succeeded") {
    const signed = mandateSigned.safeParse(object);
    if (!signed.success) return null;
    return {
      kind: "customer",
      ref: signed.data.customer,
      apply: (tx, organizationId) =>
        connectMandate(tx, organizationId, signed.data),
    };
  }
  if (event.type === "mandate.updated") {
    const updated = mandateRevoked.safeParse(object);
    if (!updated.success || updated.data.status !== "inactive") return null;
    return {
      kind: "mandate",
      ref: updated.data.id,
      apply: (tx, organizationId) => revokeMandate(tx, organizationId),
    };
  }
  const outcome = OUTCOMES[event.type];
  if (!outcome) return null;
  const parsed =
    outcome === "disputed"
      ? disputeOpened.safeParse(object).data?.payment_intent
      : intentSettled.safeParse(object).data?.id;
  if (!parsed) return null;
  const paymentRef = parsed;
  return {
    kind: "payment",
    ref: paymentRef,
    apply: (tx, organizationId, now) =>
      settle(tx, organizationId, paymentRef, outcome, now),
  };
}

async function connectMandate(
  tx: TenantTransaction,
  organizationId: string,
  signed: z.infer<typeof mandateSigned>,
) {
  const [account] = await tx
    .update(billingAccounts)
    .set({ paymentMethodId: signed.payment_method, mandateId: signed.mandate })
    .returning({ requestedBy: billingAccounts.requestedByMembershipId });
  // Page de signature ouverte hors de Stivea Vet : rien à relier.
  if (!account?.requestedBy) return;
  const connection = {
    mode: "live",
    displayLabel: "Prélèvement SEPA (Stripe)",
  };
  await tx
    .insert(integrationConnections)
    .values({
      organizationId,
      provider: "payment_mandate",
      connectedByMembershipId: account.requestedBy,
      ...connection,
    })
    .onConflictDoUpdate({
      target: [
        integrationConnections.organizationId,
        integrationConnections.provider,
      ],
      set: connection,
    });
  await auditOrganization(
    tx,
    systemAuthor(organizationId),
    "integration.connected",
    { provider: "payment_mandate", simulated: false },
  );
}

async function revokeMandate(tx: TenantTransaction, organizationId: string) {
  await tx
    .update(billingAccounts)
    .set({ paymentMethodId: null, mandateId: null });
  await tx
    .delete(integrationConnections)
    .where(eq(integrationConnections.provider, "payment_mandate"));
  await auditOrganization(
    tx,
    systemAuthor(organizationId),
    "integration.disconnected",
    { provider: "payment_mandate", reason: "mandate_inactive" },
  );
}

async function settle(
  tx: TenantTransaction,
  organizationId: string,
  providerRef: string,
  outcome: PaymentOutcome,
  now: Date,
) {
  const [submitted] = await tx
    .select({
      invoiceId: paymentEvents.invoiceId,
      amountCents: paymentEvents.amountCents,
    })
    .from(paymentEvents)
    .where(eq(paymentEvents.providerRef, providerRef))
    .limit(1);
  if (!submitted) return;
  await settleInvoice(tx, organizationId, {
    ...submitted,
    outcome,
    providerRef,
    now,
    simulated: false,
  });
}

export type StripeWebhookResult = "applied" | "duplicate" | "ignored";

/** Traite un événement déjà authentifié par sa signature. */
export async function handleStripeEvent(
  db: Database,
  event: StripeEvent,
  now: Date = new Date(),
): Promise<StripeWebhookResult> {
  const target = route(event);
  if (!target) return "ignored";
  const routed = await db.execute<{ org: string | null }>(
    sql`SELECT app.stripe_organization(${target.kind}, ${target.ref}) AS org`,
  );
  const organizationId = routed.rows[0]?.org ?? null;
  if (!organizationId) return "ignored";
  return withTenant(db, { organizationId }, async (tx) => {
    const first = await tx
      .insert(webhookEvents)
      .values({
        organizationId,
        provider: "stripe",
        eventKey: event.id,
        kind: event.type.replace(/[^a-z_]/g, "_").slice(0, 40),
      })
      .onConflictDoNothing()
      .returning({ id: webhookEvents.id });
    if (!first.length) return "duplicate";
    await target.apply(tx, organizationId, now);
    return "applied";
  });
}
