import { redirect } from "next/navigation";

import { DomainError } from "@/domains/commun/actor";
import { currentSession } from "@/server/auth";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";

/**
 * Ouverture d'un document du cabinet par lien signé (ADR 0045). Sans session déverrouillée :
 * 404, sans rien dire de plus. Lien périmé, d'une autre personne, ou document supprimé :
 * retour à la liste, qui donne des liens neufs (rien n'y est révélé de plus). Un PDF est
 * toujours téléchargé, jamais affiché ; une image s'affiche dans un bac à sable. Rien n'est
 * mis en cache ni partagé avec un autre site.
 */
const NOT_FOUND = () =>
  new Response("Introuvable", {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Nom du fichier enregistré : le titre, sans caractère interdit (RFC 6266). En UTF-8 encodé,
 * et sans accents pour les navigateurs qui ne lisent que `filename`.
 */
function disposition(
  kind: "inline" | "attachment",
  title: string,
  type: string,
) {
  const base =
    title
      .replace(/[\p{Cc}\\/:*?"<>|]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100) || "document";
  const name = `${base}.${EXTENSIONS[type] ?? "bin"}`;
  const ascii = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function GET(
  request: Request,
  context: RouteContext<"/app/documents/[id]">,
) {
  const session = await currentSession();
  if (!session || session.locked) return NOT_FOUND();
  const { id } = await context.params;
  const url = new URL(request.url);
  let file;
  try {
    file = await services.documents().open(await memberContext(), id, {
      expires: url.searchParams.get("e") ?? "",
      signature: url.searchParams.get("s") ?? "",
    });
  } catch (error) {
    if (error instanceof DomainError) redirect("/app/documents?lien=expire");
    throw error;
  }
  // Vue sur les mêmes octets, sans copie du fichier (copie seulement en mémoire partagée).
  const { buffer, byteOffset, byteLength } = file.bytes;
  const body =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer, byteOffset, byteLength)
      : Uint8Array.from(file.bytes);
  const pdf = file.contentType === "application/pdf";
  return new Response(body, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.bytes.length),
      "Content-Disposition": disposition(
        pdf ? "attachment" : "inline",
        file.title,
        file.contentType,
      ),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
    },
  });
}
