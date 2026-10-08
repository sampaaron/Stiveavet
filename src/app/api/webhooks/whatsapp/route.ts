import { configuredWhatsApp } from "@/domains/whatsapp/connexion";
import {
  WEBHOOK_MAX_BYTES,
  handleWebhook,
  validSignature,
  verificationChallenge,
  webhookPayload,
} from "@/domains/whatsapp/webhook";
import { appDatabase } from "@/server/db/client";

/**
 * Webhook de Meta pour WhatsApp (ADR 0024). Inexistant tant que WhatsApp est simulé.
 * Les réponses ne disent rien de plus que leur code ; aucun corps n'est journalisé.
 */

function reply(status: number, body: string | null = null): Response {
  return new Response(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function liveConfig() {
  const config = configuredWhatsApp();
  return config.mode === "cloud_api" ? config : null;
}

/** Vérification de l'abonnement par Meta. */
export async function GET(request: Request) {
  const config = liveConfig();
  if (!config) return reply(404);
  const challenge = verificationChallenge(
    new URL(request.url).searchParams,
    config.webhookVerifyToken,
  );
  return challenge ? reply(200, challenge) : reply(403);
}

export async function POST(request: Request) {
  const config = liveConfig();
  if (!config) return reply(404);
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > WEBHOOK_MAX_BYTES) return reply(413);
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > WEBHOOK_MAX_BYTES) return reply(413);
  if (
    !validSignature(
      body,
      request.headers.get("x-hub-signature-256"),
      config.appSecret,
    )
  )
    return reply(401);
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return reply(400);
  }
  const payload = webhookPayload.safeParse(json);
  // Forme inattendue mais signée : accusé de réception, rien à traiter (pas de rejeu).
  if (!payload.success) return reply(200);
  // Une erreur (base indisponible) renvoie 500 : Meta rejouera, sans doublon.
  await handleWebhook(appDatabase(), payload.data);
  return reply(200);
}
