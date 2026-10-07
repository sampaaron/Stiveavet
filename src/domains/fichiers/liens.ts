import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Liens de lecture des fichiers (architecture §7, ADR 0019) : très courts, signés et limités
 * à la personne autorisée. La signature lie le fichier, le membre du cabinet qui a ouvert le
 * dossier et l'heure d'expiration ; le membre n'apparaît pas dans le lien, il est repris de
 * la session à l'ouverture. Un lien transmis à quelqu'un d'autre, ou périmé, ne s'ouvre pas.
 * Les droits sont de toute façon revérifiés à chaque ouverture.
 */
export const LINK_TTL_SECONDS = 120;

const PREFIX = "stivea-fichier-v1";

export type SignedLink = { url: string; expiresAt: Date };

function signature(
  secret: string,
  attachmentId: string,
  membershipId: string,
  expiresAtMs: number,
): Buffer {
  return createHmac("sha256", secret)
    .update(`${PREFIX}:${attachmentId}:${membershipId}:${expiresAtMs}`)
    .digest();
}

export function signReadLink(input: {
  secret: string;
  attachmentId: string;
  membershipId: string;
  now?: Date;
}): SignedLink {
  const now = input.now ?? new Date();
  const expiresAtMs = now.getTime() + LINK_TTL_SECONDS * 1000;
  const sig = signature(
    input.secret,
    input.attachmentId,
    input.membershipId,
    expiresAtMs,
  ).toString("base64url");
  return {
    url: `/app/fichiers/${input.attachmentId}?e=${expiresAtMs}&s=${sig}`,
    expiresAt: new Date(expiresAtMs),
  };
}

/** Lien valable pour ce fichier, ce membre et maintenant ; sinon refus, sans détail. */
export function verifyReadLink(input: {
  secret: string;
  attachmentId: string;
  membershipId: string;
  expires: string;
  signature: string;
  now?: Date;
}): boolean {
  if (!/^\d{13,16}$/.test(input.expires)) return false;
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.signature)) return false;
  const expiresAtMs = Number(input.expires);
  const now = (input.now ?? new Date()).getTime();
  // Périmé, ou d'une durée plus longue que permise (lien fabriqué) : refusé.
  if (expiresAtMs < now || expiresAtMs > now + LINK_TTL_SECONDS * 1000)
    return false;
  const expected = signature(
    input.secret,
    input.attachmentId,
    input.membershipId,
    expiresAtMs,
  );
  const given = Buffer.from(input.signature, "base64url");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
