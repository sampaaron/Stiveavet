import "server-only";

import { z } from "zod";

/**
 * Variables d'environnement serveur, validées une seule fois.
 * Aucune valeur secrète n'a de défaut dans le code : elles viennent de `.env` en local
 * et du gestionnaire de secrets Scaleway en staging/production.
 */
export const serverEnvSchema = z.object({
  APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
  APP_URL: z.url().default("http://localhost:3000"),
  // Obligatoire à partir du lot 3 (base de données).
  DATABASE_URL: z.url().optional(),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(
  source: Record<string, string | undefined>,
): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    // On ne journalise que les noms de variables fautives, jamais leurs valeurs.
    const names = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new Error(`Configuration invalide : ${names.join(", ")}`);
  }
  return result.data;
}

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
