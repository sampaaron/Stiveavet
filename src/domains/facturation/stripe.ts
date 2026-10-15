import { z } from "zod";

import { fakeBillingProvider } from "@/adapters/billing-provider/fake";
import { BillingUnavailableError } from "@/adapters/billing-provider/types";
import type { BillingProvider } from "@/adapters/billing-provider/types";
import { fakePaymentMandate } from "@/adapters/payments/fake";
import type { PaymentMandateProvider } from "@/adapters/payments/types";
import { StripeError, stripeApi } from "@/adapters/stripe/api";
import type { StripeApi } from "@/adapters/stripe/api";
import { billingAccounts } from "@/server/db/schema";
import type { TenantTransaction } from "@/server/db/tenant";

/**
 * Choix du prestataire de prélèvement (ADR 0027), avec une coupure franche :
 * - `simulated` : poste local seulement ;
 * - `stripe` : clé secrète et secret du webhook obligatoires ; une clé de production n'est
 *   acceptée qu'en production, une clé de test partout ailleurs.
 * Aucune donnée bancaire ne passe par Stivea Vet : l'IBAN est saisi sur la page de Stripe.
 */

const configSchema = z
  .object({
    APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
    APP_URL: z.url().default("http://localhost:3000"),
    BILLING_PROVIDER: z.enum(["simulated", "stripe"]).default("simulated"),
    STRIPE_SECRET_KEY: z
      .string()
      .regex(/^(sk|rk)_(test|live)_[A-Za-z0-9]{16,256}$/)
      .optional(),
    STRIPE_WEBHOOK_SECRET: z
      .string()
      .regex(/^whsec_[A-Za-z0-9+/=]{16,256}$/)
      .optional(),
  })
  .superRefine((env, context) => {
    const issue = (path: string) =>
      context.addIssue({ code: "custom", path: [path], message: "invalide" });
    if (env.BILLING_PROVIDER === "simulated") {
      if (env.APP_ENV !== "local") issue("BILLING_PROVIDER");
      return;
    }
    if (!env.STRIPE_SECRET_KEY) issue("STRIPE_SECRET_KEY");
    if (!env.STRIPE_WEBHOOK_SECRET) issue("STRIPE_WEBHOOK_SECRET");
    const live = /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY ?? "");
    if (live !== (env.APP_ENV === "production")) issue("STRIPE_SECRET_KEY");
  });

export type BillingConfig =
  | { mode: "simulated" }
  | {
      mode: "stripe";
      secretKey: string;
      webhookSecret: string;
      appUrl: string;
    };

/** Configuration validée ; une erreur ne cite que des noms de variables, jamais leurs valeurs. */
export function billingConfig(
  source: Record<string, string | undefined>,
): BillingConfig {
  const result = configSchema.safeParse(source);
  if (!result.success) {
    const names = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new Error(`Configuration invalide : ${names.join(", ")}`);
  }
  const env = result.data;
  if (env.BILLING_PROVIDER === "simulated") return { mode: "simulated" };
  return {
    mode: "stripe",
    secretKey: env.STRIPE_SECRET_KEY ?? "",
    webhookSecret: env.STRIPE_WEBHOOK_SECRET ?? "",
    appUrl: env.APP_URL.replace(/\/+$/, ""),
  };
}

let configured: BillingConfig | undefined;

/** Configuration du processus, lue et validée une seule fois. */
export function configuredBilling(): BillingConfig {
  configured ??= billingConfig(process.env);
  return configured;
}

async function account(tx: TenantTransaction) {
  const [row] = await tx.select().from(billingAccounts);
  return row ?? null;
}

/** Prélèvement des factures sur le mandat SEPA du cabinet, par Stripe. */
export function stripeBillingProvider(api: StripeApi): BillingProvider {
  return {
    simulated: false,
    async collect(tx, input) {
      const found = await account(tx);
      if (!found?.paymentMethodId || !found.mandateId)
        throw new BillingUnavailableError("no_mandate");
      try {
        const result = await api.collect({
          customerId: found.stripeCustomerId,
          paymentMethodId: found.paymentMethodId,
          mandateId: found.mandateId,
          amountCents: input.amountCents,
          organizationId: input.organizationId,
          invoiceId: input.invoiceId,
          invoiceNumber: input.invoiceNumber,
          // Une tentative rejouée (worker relancé) ne prélève jamais deux fois.
          idempotencyKey: `invoice:${input.invoiceId}:${input.attempt}`,
        });
        return { status: result.status, providerRef: result.id };
      } catch (error) {
        if (error instanceof StripeError)
          throw new BillingUnavailableError(error.failure);
        throw error;
      }
    },
  };
}

/** Mandat SEPA signé sur la page de Stripe ; connecté seulement à réception du webhook. */
export function stripeMandateProvider(
  api: StripeApi,
  appUrl: string,
): PaymentMandateProvider {
  return {
    simulated: false,
    async startMandate(tx, input) {
      // Client Stripe créé une fois par cabinet (clé d'idempotence : le cabinet).
      const customerId =
        (await account(tx))?.stripeCustomerId ??
        (await api.createCustomer(input));
      await tx
        .insert(billingAccounts)
        .values({
          organizationId: input.organizationId,
          stripeCustomerId: customerId,
          requestedByMembershipId: input.membershipId,
        })
        .onConflictDoUpdate({
          target: billingAccounts.organizationId,
          set: { requestedByMembershipId: input.membershipId },
        });
      const session = await api.createMandateSession({
        customerId,
        organizationId: input.organizationId,
        locale: input.locale,
        successUrl: `${appUrl}/app/reglages?mandat=signe`,
        cancelUrl: `${appUrl}/app/reglages`,
      });
      return session.url;
    },
    async revokeMandate(tx) {
      const found = await account(tx);
      if (!found?.paymentMethodId) return;
      await api.detachPaymentMethod(found.paymentMethodId);
      await tx
        .update(billingAccounts)
        .set({ paymentMethodId: null, mandateId: null });
    },
  };
}

/** Prestataires du processus : simulés en local, Stripe sinon. */
export function billingProviders(
  config: BillingConfig = configuredBilling(),
  fetcher: typeof fetch = globalThis.fetch,
): { billing: BillingProvider; payments: PaymentMandateProvider } {
  if (config.mode === "simulated")
    return { billing: fakeBillingProvider(), payments: fakePaymentMandate };
  const api = stripeApi({ fetch: fetcher, secretKey: config.secretKey });
  return {
    billing: stripeBillingProvider(api),
    payments: stripeMandateProvider(api, config.appUrl),
  };
}
