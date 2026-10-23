import { createHash, createHmac } from "node:crypto";

import { z } from "zod";

import { parseConfig } from "@/server/config";

/**
 * Empreintes des adresses IP et des e-mails (compteurs de tentatives, journal de connexion) :
 * HMAC-SHA256 avec une clé secrète. Sans la clé, une empreinte ne se retrouve pas en essayant
 * toutes les adresses IPv4 ou un dictionnaire d'e-mails (ADR 0039).
 * Sans « server-only » : le worker et les scripts l'importent aussi.
 */

/** Clé du gestionnaire de secrets, 32 caractères au moins. */
export const fingerprintSecret = z.string().min(32).optional();

const fingerprintConfig = z
  .object({
    APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
    FINGERPRINT_SECRET: fingerprintSecret,
  })
  .superRefine((env, context) => {
    if (env.APP_ENV !== "local" && !env.FINGERPRINT_SECRET)
      context.addIssue({
        code: "custom",
        path: ["FINGERPRINT_SECRET"],
        message: "requis",
      });
  });

/**
 * Clé des empreintes. En local seulement, sans valeur, elle est dérivée d'une constante :
 * stable d'un démarrage à l'autre, sans rien protéger (données fictives). Ailleurs, l'absence
 * de clé empêche de démarrer ; l'erreur ne cite que le nom de la variable.
 */
export function parseFingerprintKey(
  source: Record<string, string | undefined>,
): Buffer {
  const { FINGERPRINT_SECRET } = parseConfig(fingerprintConfig, source);
  return FINGERPRINT_SECRET
    ? Buffer.from(FINGERPRINT_SECRET, "utf8")
    : createHash("sha256").update("stivea-vet:empreintes-locales").digest();
}

let key: Buffer | undefined;

/** Empreinte hexadécimale (64 caractères) d'une valeur, avec la clé de la configuration. */
export function fingerprint(value: string): string {
  key ??= parseFingerprintKey(process.env);
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}
