import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signature des webhooks Stripe (en-tête `Stripe-Signature`, ADR 0027) : HMAC SHA-256 de
 * `<horodatage>.<corps brut>` avec le secret du webhook. Un envoi de plus de 5 minutes est
 * refusé, pour qu'un événement intercepté ne puisse pas être rejoué plus tard.
 */

export const SIGNATURE_TOLERANCE_SECONDS = 300;

function digest(secret: string, timestamp: string, body: Uint8Array): Buffer {
  return createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(body)
    .digest();
}

export function validStripeSignature(
  body: Uint8Array,
  header: string | null,
  secret: string,
  now = new Date(),
): boolean {
  if (!header || header.length > 1000) return false;
  let timestamp: string | null = null;
  const signatures: Buffer[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t" && value && /^[0-9]{1,12}$/.test(value)) timestamp = value;
    if (key === "v1" && value && /^[0-9a-f]{64}$/.test(value))
      signatures.push(Buffer.from(value, "hex"));
  }
  if (!timestamp || !signatures.length) return false;
  const age = Math.abs(now.getTime() / 1000 - Number(timestamp));
  if (age > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = digest(secret, timestamp, body);
  return signatures.some((signature) => timingSafeEqual(signature, expected));
}

/** En-tête signé, pour l'imitation de Stripe et les tests. */
export function stripeSignatureHeader(
  body: Uint8Array,
  secret: string,
  at = new Date(),
): string {
  const timestamp = String(Math.floor(at.getTime() / 1000));
  return `t=${timestamp},v1=${digest(secret, timestamp, body).toString("hex")}`;
}
