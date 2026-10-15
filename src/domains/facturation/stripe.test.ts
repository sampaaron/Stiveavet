import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { billingConfig } from "./stripe";

const key = (mode: "test" | "live") =>
  `sk_${mode}_${randomBytes(12).toString("hex")}`;
const webhook = () => `whsec_${randomBytes(12).toString("hex")}`;

describe("configuration des prélèvements", () => {
  it("simulés par défaut en local, interdits ailleurs", () => {
    expect(billingConfig({})).toEqual({ mode: "simulated" });
    expect(() => billingConfig({ APP_ENV: "staging" })).toThrow(
      "BILLING_PROVIDER",
    );
  });

  it("Stripe exige ses deux secrets, et l'erreur ne cite que leurs noms", () => {
    const secret = key("test");
    const error = (() => {
      try {
        billingConfig({
          BILLING_PROVIDER: "stripe",
          STRIPE_SECRET_KEY: secret,
        });
      } catch (caught) {
        return caught instanceof Error ? caught.message : "";
      }
      return "";
    })();
    expect(error).toContain("STRIPE_WEBHOOK_SECRET");
    expect(error).not.toContain(secret);
  });

  it("une clé de production seulement en production, une clé de test ailleurs", () => {
    const stripe = {
      BILLING_PROVIDER: "stripe",
      STRIPE_WEBHOOK_SECRET: webhook(),
    };
    expect(
      billingConfig({ ...stripe, STRIPE_SECRET_KEY: key("test") }).mode,
    ).toBe("stripe");
    expect(() =>
      billingConfig({ ...stripe, STRIPE_SECRET_KEY: key("live") }),
    ).toThrow("STRIPE_SECRET_KEY");
    expect(() =>
      billingConfig({
        ...stripe,
        APP_ENV: "production",
        APP_URL: "https://stivea.test",
        STRIPE_SECRET_KEY: key("test"),
      }),
    ).toThrow("STRIPE_SECRET_KEY");
  });
});
