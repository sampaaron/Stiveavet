import "server-only";

import { z } from "zod";

/**
 * Variables d'environnement serveur, validées une seule fois.
 * Aucune valeur secrète n'a de défaut dans le code : elles viennent de `.env` en local
 * et du gestionnaire de secrets Scaleway en staging/production.
 */
export const serverEnvSchema = z
  .object({
    APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
    APP_URL: z.url().default("http://localhost:3000"),
    // Obligatoire à partir du lot 3 (base de données).
    DATABASE_URL: z.url().optional(),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    // « true » seulement derrière le répartiteur de charge, qui écrit X-Forwarded-For.
    // Sinon l'en-tête est falsifiable : l'IP est alors ignorée (pas de limite par IP).
    // Clé des liens de lecture signés des fichiers (ADR 0019), 32 caractères au moins.
    // En local, sans valeur, une clé aléatoire est tirée au démarrage (liens perdus au
    // redémarrage, sans conséquence : ils ne vivent que deux minutes).
    FILE_LINK_SECRET: z.string().min(32).optional(),
    // Stockage objet local de la phase 2 : chemin absolu (défaut : .data/objets).
    OBJECT_STORAGE_DIR: z
      .string()
      .refine((value) => value.startsWith("/"))
      .optional(),
    TRUST_PROXY: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
  })
  .superRefine((env, context) => {
    // Hors local, la limite de tentatives par adresse IP est obligatoire, donc l'IP aussi.
    if (env.APP_ENV !== "local" && !env.TRUST_PROXY)
      context.addIssue({
        code: "custom",
        path: ["TRUST_PROXY"],
        message: "requis",
      });
    // Hors local, la clé des liens signés est fixe et vient du gestionnaire de secrets.
    if (env.APP_ENV !== "local" && !env.FILE_LINK_SECRET)
      context.addIssue({
        code: "custom",
        path: ["FILE_LINK_SECRET"],
        message: "requis",
      });
    // Hors local, les cookies d'authentification doivent être Secure.
    if (env.APP_ENV !== "local" && !env.APP_URL.startsWith("https://"))
      context.addIssue({
        code: "custom",
        path: ["APP_URL"],
        message: "https requis",
      });
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
