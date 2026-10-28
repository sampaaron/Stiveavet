import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Liens de lecture des fichiers (architecture §7, ADR 0019) : très courts, signés et limités
 * à la personne autorisée. La signature lie le fichier, le membre du cabinet qui a ouvert le
 * dossier et l'heure d'expiration ; le membre n'apparaît pas dans le lien, il est repris de
 * la session à l'ouverture. Un lien transmis à quelqu'un d'autre, ou périmé, ne s'ouvre pas.
 * Les droits sont de toute façon revérifiés à chaque ouverture.
 *
 * Deux portées, signées à part (un lien de l'une ne vaut jamais pour l'autre) :
 * - `attachment` : photo ou vocal d'un suivi, deux minutes ;
 * - `document` : document du cabinet (ADR 0045), cinq minutes, car la liste reste ouverte
 *   plus longtemps qu'un dossier.
 */
export type LinkScope = "attachment" | "document";

const SCOPES: Record<
  LinkScope,
  { prefix: string; ttlSeconds: number; path: (id: string) => string }
> = {
  attachment: {
    prefix: "stivea-fichier-v1",
    ttlSeconds: 120,
    path: (id) => `/app/fichiers/${id}`,
  },
  document: {
    prefix: "stivea-document-v1",
    ttlSeconds: 300,
    path: (id) => `/app/documents/${id}`,
  },
};

export const LINK_TTL_SECONDS = SCOPES.attachment.ttlSeconds;
export const DOCUMENT_LINK_TTL_SECONDS = SCOPES.document.ttlSeconds;

export type SignedLink = { url: string; expiresAt: Date };

function signature(
  secret: string,
  scope: LinkScope,
  fileId: string,
  membershipId: string,
  expiresAtMs: number,
): Buffer {
  return createHmac("sha256", secret)
    .update(`${SCOPES[scope].prefix}:${fileId}:${membershipId}:${expiresAtMs}`)
    .digest();
}

export function signReadLink(input: {
  secret: string;
  fileId: string;
  membershipId: string;
  scope?: LinkScope;
  now?: Date;
}): SignedLink {
  const scope = input.scope ?? "attachment";
  const now = input.now ?? new Date();
  const expiresAtMs = now.getTime() + SCOPES[scope].ttlSeconds * 1000;
  const sig = signature(
    input.secret,
    scope,
    input.fileId,
    input.membershipId,
    expiresAtMs,
  ).toString("base64url");
  return {
    url: `${SCOPES[scope].path(input.fileId)}?e=${expiresAtMs}&s=${sig}`,
    expiresAt: new Date(expiresAtMs),
  };
}

/** Lien valable pour ce fichier, ce membre et maintenant ; sinon refus, sans détail. */
export function verifyReadLink(input: {
  secret: string;
  fileId: string;
  membershipId: string;
  expires: string;
  signature: string;
  scope?: LinkScope;
  now?: Date;
}): boolean {
  const scope = input.scope ?? "attachment";
  if (!/^\d{13,16}$/.test(input.expires)) return false;
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.signature)) return false;
  const expiresAtMs = Number(input.expires);
  const now = (input.now ?? new Date()).getTime();
  // Périmé, ou d'une durée plus longue que permise (lien fabriqué) : refusé.
  if (expiresAtMs < now || expiresAtMs > now + SCOPES[scope].ttlSeconds * 1000)
    return false;
  const expected = signature(
    input.secret,
    scope,
    input.fileId,
    input.membershipId,
    expiresAtMs,
  );
  const given = Buffer.from(input.signature, "base64url");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
