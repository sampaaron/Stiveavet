import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { stripeSignatureHeader, validStripeSignature } from "./signature";

const secret = `whsec_${randomBytes(12).toString("hex")}`;
const body = new TextEncoder().encode('{"id":"evt_essai12345"}');

describe("signature des webhooks Stripe", () => {
  it("accepte un envoi signé et récent", () => {
    expect(
      validStripeSignature(body, stripeSignatureHeader(body, secret), secret),
    ).toBe(true);
  });

  it("refuse un autre secret, un corps modifié, un en-tête absent ou malformé", () => {
    const header = stripeSignatureHeader(body, secret);
    expect(validStripeSignature(body, header, `${secret}x`)).toBe(false);
    const altered = new TextEncoder().encode('{"id":"evt_autre12345"}');
    expect(validStripeSignature(altered, header, secret)).toBe(false);
    expect(validStripeSignature(body, null, secret)).toBe(false);
    expect(validStripeSignature(body, "t=abc,v1=zz", secret)).toBe(false);
  });

  it("refuse un envoi de plus de 5 minutes (rejeu)", () => {
    const old = new Date(Date.now() - 6 * 60_000);
    expect(
      validStripeSignature(
        body,
        stripeSignatureHeader(body, secret, old),
        secret,
      ),
    ).toBe(false);
  });
});
