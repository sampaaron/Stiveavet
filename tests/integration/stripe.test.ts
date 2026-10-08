import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createOrganization } from "../../db/seed/cabinets-fictifs";
import { createFakeDrVeto } from "@/adapters/drveto/fake";
import { stripeApi } from "@/adapters/stripe/api";
import { stripeImitation } from "@/adapters/stripe/imitation";
import type { Actor } from "@/domains/equipe/actor";
import { addMonths } from "@/domains/facturation/rules";
import {
  billingService,
  startSubscription,
} from "@/domains/facturation/service";
import {
  stripeBillingProvider,
  stripeMandateProvider,
} from "@/domains/facturation/stripe";
import {
  handleStripeEvent,
  stripeEvent,
} from "@/domains/facturation/webhook-stripe";
import { settingsService } from "@/domains/reglages/service";
import { withTenant } from "@/server/db/tenant";

import { pools } from "./support/db";

/**
 * Prélèvements SEPA par Stripe (ADR 0027), contre l'imitation locale de l'API : mandat signé
 * sur la page de Stripe, prélèvement « en cours », puis issue par webhook signé.
 */

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

const SECRET_KEY = `sk_test_${randomBytes(12).toString("hex")}`;
const stripe = stripeImitation({
  secretKey: SECRET_KEY,
  webhookSecret: `whsec_${randomBytes(12).toString("hex")}`,
});
const api = stripeApi({
  fetch: stripe.fetch,
  secretKey: SECRET_KEY,
});
const billing = billingService({
  db: appDb,
  provider: stripeBillingProvider(api),
});
const settings = settingsService({
  db: appDb,
  whatsapp: { live: false },
  drveto: createFakeDrVeto(),
  payments: stripeMandateProvider(api, "https://stivea.test"),
});

const event = (signed: { event: unknown }) => stripeEvent.parse(signed.event);

async function cabinet(): Promise<Actor> {
  const org = randomUUID();
  const tag = org.slice(0, 8);
  const [adminId] = await createOrganization(appDb, org, "Clinique Stripe", [
    {
      email: `st-${tag}@essai.test`,
      displayName: "Dr Sam Tripe",
      role: "admin_vet",
    },
  ]);
  if (!adminId) throw new Error("cabinet");
  await withTenant(appDb, { organizationId: org }, (tx) =>
    startSubscription(tx, org, "clinic", addMonths(new Date(), -1)),
  );
  const { rows } = await admin.query<{ user_id: string }>(
    "SELECT user_id FROM memberships WHERE id = $1",
    [adminId],
  );
  return {
    organizationId: org,
    userId: rows[0]?.user_id ?? "",
    membershipId: adminId,
    role: "admin_vet",
    permissions: new Set(["organization.settings", "billing.manage"]),
  };
}

async function signMandate(owner: Actor) {
  const url = await settings.startMandate(owner, "fr");
  const sessionId = [...stripe.sessions.keys()].at(-1) ?? "";
  expect(url).toMatch(/^https:\/\//);
  return stripe.mandateSigned(sessionId);
}

describe("mandat SEPA", () => {
  it("n'est connecté qu'à réception de l'événement signé, une seule fois", async () => {
    const owner = await cabinet();
    const signed = await signMandate(owner);
    expect(
      (await settings.get(owner)).integrations.payment_mandate,
    ).toBeUndefined();

    expect(await handleStripeEvent(appDb, event(signed))).toBe("applied");
    expect(await handleStripeEvent(appDb, event(signed))).toBe("duplicate");
    const connection = (await settings.get(owner)).integrations.payment_mandate;
    expect(connection?.live).toBe(true);

    await settings.disconnect(owner, "payment_mandate");
    expect(stripe.detached).toContain(signed.paymentMethod);
  });

  it("un événement d'un client inconnu est accusé sans effet", async () => {
    const stranger = stripe.signed("setup_intent.succeeded", {
      customer: "cus_inconnu123456",
      payment_method: "pm_inconnu123456",
      mandate: "mandate_inconnu123456",
    });
    expect(await handleStripeEvent(appDb, event(stranger))).toBe("ignored");
  });
});

describe("prélèvements", () => {
  it("en cours, puis payé, puis contesté : la facture repasse en refusée", async () => {
    const owner = await cabinet();
    await handleStripeEvent(appDb, event(await signMandate(owner)));

    const overview = await billing.overview(owner);
    expect(
      overview.invoices.every((invoice) => invoice.status === "processing"),
    ).toBe(true);
    expect(overview.access).toEqual({ kind: "full" });

    for (const intent of stripe.intents.filter(
      (candidate) =>
        candidate.metadata.organization_id === owner.organizationId,
    ))
      expect(
        await handleStripeEvent(
          appDb,
          event(stripe.paymentSettled(intent.id, "succeeded")),
        ),
      ).toBe("applied");
    const paid = await billing.overview(owner);
    expect(paid.invoices.every((invoice) => invoice.status === "paid")).toBe(
      true,
    );

    const [first] = stripe.intents.filter(
      (candidate) =>
        candidate.metadata.organization_id === owner.organizationId,
    );
    if (!first) throw new Error("prélèvement");
    await handleStripeEvent(appDb, event(stripe.disputed(first.id)));
    const disputed = await billing.overview(owner);
    expect(
      disputed.invoices.some((invoice) => invoice.status === "failed"),
    ).toBe(true);
    expect(disputed.access.kind).toBe("grace");
  });

  it("un refus de la banque ouvre la régularisation", async () => {
    const owner = await cabinet();
    await handleStripeEvent(appDb, event(await signMandate(owner)));
    await billing.overview(owner);
    const [intent] = stripe.intents.filter(
      (candidate) =>
        candidate.metadata.organization_id === owner.organizationId,
    );
    if (!intent) throw new Error("prélèvement");
    await handleStripeEvent(
      appDb,
      event(stripe.paymentSettled(intent.id, "failed")),
    );
    const overview = await billing.overview(owner);
    expect(overview.access.kind).toBe("grace");
  });

  it("Stripe injoignable : la facture reste à prélever, rien n'est bloqué", async () => {
    const owner = await cabinet();
    await handleStripeEvent(appDb, event(await signMandate(owner)));
    stripe.failNext(
      { status: 503, code: "api_error" },
      { status: 503, code: "api_error" },
    );
    const overview = await billing.overview(owner);
    expect(overview.invoices.some((invoice) => invoice.status === "open")).toBe(
      true,
    );
    expect(overview.access).toEqual({ kind: "full" });
  });
});
