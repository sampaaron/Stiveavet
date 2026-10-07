import type { NextRequest } from "next/server";

import { services } from "@/server/services";

/**
 * Désinscription en un clic depuis la messagerie (en-têtes List-Unsubscribe, RFC 8058).
 * POST uniquement : un simple affichage du lien (aperçu, antivirus) ne désinscrit personne.
 * La réponse est identique que le jeton soit valable ou non.
 */
export async function POST(request: NextRequest) {
  await services
    .demo()
    .unsubscribe(request.nextUrl.searchParams.get("jeton") ?? undefined);
  return new Response(null, { status: 204 });
}
