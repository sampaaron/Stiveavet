import { DomainError } from "@/domains/equipe/actor";
import { currentSession } from "@/server/auth";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";

/**
 * Lecture d'une photo ou d'un vocal par lien signé (architecture §7, ADR 0019). Sans session
 * déverrouillée, avec un lien périmé, d'une autre personne ou sans accès clinique au
 * dossier : 404, sans rien dire de plus. Le fichier n'est jamais mis en cache, ne s'exécute
 * jamais (type imposé, bac à sable) et ne se partage pas avec un autre site.
 */
const NOT_FOUND = () =>
  new Response("Introuvable", {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });

export async function GET(
  request: Request,
  context: RouteContext<"/app/fichiers/[id]">,
) {
  const session = await currentSession();
  if (!session || session.locked) return NOT_FOUND();
  const { id } = await context.params;
  const url = new URL(request.url);
  try {
    const object = await services.media().open(await memberContext(), id, {
      expires: url.searchParams.get("e") ?? "",
      signature: url.searchParams.get("s") ?? "",
    });
    return new Response(Buffer.from(object.bytes), {
      headers: {
        "Content-Type": object.contentType,
        "Content-Length": String(object.bytes.length),
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    if (error instanceof DomainError) return NOT_FOUND();
    throw error;
  }
}
