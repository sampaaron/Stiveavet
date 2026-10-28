import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Chiffrement des secrets confiés par un prestataire et gardés en base (jeton WhatsApp d'un
 * cabinet, ADR 0024) : AES-256-GCM, une clé de 32 octets venue du gestionnaire de secrets,
 * jamais du dépôt. Le contexte (type de secret et cabinet) est authentifié avec le chiffré :
 * un jeton copié vers la ligne d'un autre cabinet ne se déchiffre pas.
 *
 * Format stocké : `v1.<clé>.<iv>.<chiffré>.<étiquette>`, en base64url. L'identifiant de clé
 * permet la rotation : la première clé chiffre, toutes déchiffrent.
 * Sans « server-only » : le worker l'importe aussi.
 */

export type SecretBox = {
  seal(plaintext: string, context: string): string;
  open(sealed: string, context: string): string;
};

const KEY_ID = /^[a-z0-9-]{1,32}$/;
/** Vecteur de 96 bits et étiquette complète de 128 bits (NIST SP 800-38D). */
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class SecretBoxError extends Error {
  constructor() {
    // Jamais le secret ni le chiffré dans le message.
    super("Secret illisible");
  }
}

/**
 * Lit `SECRETS_ENCRYPTION_KEYS` : `id:clé-base64[,id:clé-base64…]`, la première chiffre.
 * Lève une erreur qui ne contient que le nom de la variable.
 */
export function parseSecretKeys(
  value: string | undefined,
): ReadonlyMap<string, Buffer> {
  const keys = new Map<string, Buffer>();
  for (const entry of (value ?? "").split(",")) {
    const [id, encoded, ...rest] = entry.trim().split(":");
    const key = Buffer.from(encoded ?? "", "base64");
    if (!id || !KEY_ID.test(id) || rest.length > 0 || key.length !== 32)
      throw new Error("Configuration invalide : SECRETS_ENCRYPTION_KEYS");
    if (keys.has(id))
      throw new Error("Configuration invalide : SECRETS_ENCRYPTION_KEYS");
    keys.set(id, key);
  }
  return keys;
}

export function secretBox(keys: ReadonlyMap<string, Buffer>): SecretBox {
  const [current] = keys.keys();
  if (!current)
    throw new Error("Configuration invalide : SECRETS_ENCRYPTION_KEYS");
  return {
    seal(plaintext, context) {
      const key = keys.get(current);
      if (!key) throw new SecretBoxError();
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv("aes-256-gcm", key, iv, {
        authTagLength: TAG_BYTES,
      });
      cipher.setAAD(Buffer.from(context, "utf8"));
      const data = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ]);
      return [
        "v1",
        current,
        iv.toString("base64url"),
        data.toString("base64url"),
        cipher.getAuthTag().toString("base64url"),
      ].join(".");
    },
    open(sealed, context) {
      const [version, keyId, iv, data, tag, ...rest] = sealed.split(".");
      const key = keyId ? keys.get(keyId) : undefined;
      if (version !== "v1" || !key || !iv || !data || !tag || rest.length > 0)
        throw new SecretBoxError();
      // Longueurs imposées : une étiquette tronquée affaiblirait l'authentification.
      const ivBytes = Buffer.from(iv, "base64url");
      const tagBytes = Buffer.from(tag, "base64url");
      if (ivBytes.length !== IV_BYTES || tagBytes.length !== TAG_BYTES)
        throw new SecretBoxError();
      try {
        const decipher = createDecipheriv("aes-256-gcm", key, ivBytes, {
          authTagLength: TAG_BYTES,
        });
        decipher.setAAD(Buffer.from(context, "utf8"));
        decipher.setAuthTag(tagBytes);
        return Buffer.concat([
          decipher.update(Buffer.from(data, "base64url")),
          decipher.final(),
        ]).toString("utf8");
      } catch {
        throw new SecretBoxError();
      }
    },
  };
}
