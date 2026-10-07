import { createHash, randomBytes, randomInt } from "node:crypto";

/** Jeton opaque transmis au navigateur (cookie ou lien) ; seule son empreinte est stockée. */
export function createToken(): string {
  return randomBytes(32).toString("base64url");
}

export function tokenHash(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

/** Forme attendue d'un jeton reçu (43 caractères base64url) : rejette tôt toute valeur arbitraire. */
export function isWellFormedToken(value: string | undefined): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/** Code à 6 chiffres, tiré uniformément. */
export function createSecurityCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** Le code n'a de sens qu'avec le jeton du défi : un code seul ne permet rien. */
export function securityCodeHash(challengeToken: string, code: string): Buffer {
  return createHash("sha256")
    .update(`${challengeToken}:${code}`, "utf8")
    .digest();
}

/** Clé de compteur : empreinte, jamais l'e-mail ou l'adresse IP en clair. */
export function rateLimitBucket(name: string, subject: string): string {
  const digest = createHash("sha256")
    .update(subject.toLowerCase(), "utf8")
    .digest("hex");
  return `${name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}:${digest}`;
}

/** Empreinte tronquée d'une adresse IP pour le journal de connexion. */
export function ipFingerprint(ip: string | null): string | null {
  if (!ip) return null;
  return createHash("sha256")
    .update(`stivea-ip:${ip}`, "utf8")
    .digest("hex")
    .slice(0, 16);
}
