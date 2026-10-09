import { validStripeSignature } from "@/adapters/stripe/signature";
import { configuredBilling } from "@/domains/facturation/stripe";
import {
  STRIPE_WEBHOOK_MAX_BYTES,
  handleStripeEvent,
  stripeEvent,
} from "@/domains/facturation/webhook-stripe";
import { appDatabase } from "@/server/db/client";

/**
 * Webhook de Stripe pour les prélèvements (ADR 0027). Inexistant tant que la facturation est
 * simulée. Les réponses ne disent rien de plus que leur code ; aucun corps n'est journalisé.
 */

function reply(status: number): Response {
  return new Response(null, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const config = configuredBilling();
  if (config.mode !== "stripe") return reply(404);
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > STRIPE_WEBHOOK_MAX_BYTES) return reply(413);
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > STRIPE_WEBHOOK_MAX_BYTES) return reply(413);
  if (
    !validStripeSignature(
      body,
      request.headers.get("stripe-signature"),
      config.webhookSecret,
    )
  )
    return reply(401);
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return reply(400);
  }
  const event = stripeEvent.safeParse(json);
  // Forme inattendue mais signée : accusé de réception, rien à traiter (pas de rejeu).
  if (!event.success) return reply(200);
  // Une erreur (base indisponible) renvoie 500 : Stripe rejouera, sans doublon.
  await handleStripeEvent(appDatabase(), event.data);
  return reply(200);
}
