import { z } from "zod";

import { parseConfig } from "@/server/config";

/**
 * Configuration du worker (ADR 0014, 0041), validée au démarrage. Hors local, l'adresse
 * publique est obligatoire et en HTTPS : sinon les e-mails du worker pointeraient vers
 * localhost. Une erreur ne cite que les noms des variables, jamais leurs valeurs.
 */
const workerSchema = z
  .object({
    APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
    DATABASE_URL: z.url(),
    // Attente entre deux passages sans signal de réveil : bornée, jamais une boucle continue.
    WORKER_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(500)
      .max(60_000)
      .default(5_000),
    APP_URL: z.url().optional(),
  })
  .superRefine((env, context) => {
    if (env.APP_ENV !== "local" && !env.APP_URL?.startsWith("https://"))
      context.addIssue({
        code: "custom",
        path: ["APP_URL"],
        message: "requis",
      });
  });

export type WorkerConfig = {
  databaseUrl: string;
  intervalMs: number;
  appUrl: string;
};

export function workerConfig(
  source: Record<string, string | undefined>,
): WorkerConfig {
  const env = parseConfig(workerSchema, source);
  return {
    databaseUrl: env.DATABASE_URL,
    intervalMs: env.WORKER_INTERVAL_MS,
    appUrl: env.APP_URL ?? "http://localhost:3000",
  };
}
