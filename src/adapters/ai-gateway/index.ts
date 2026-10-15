import { z } from "zod";

import { apiAiGateway } from "./api-compatible";
import { fakeAiGateway } from "./fake";
import type { AiGateway } from "./types";

/**
 * Choix de la passerelle IA (ADR 0026), avec une coupure franche :
 * - `simulated` : réponses écrites d'avance, poste local seulement ;
 * - `scaleway` ou `mistral` : fournisseur européen, sans entraînement sur nos données,
 *   seulement si la clé et les trois modèles sont fournis.
 * Une erreur de configuration ne cite que des noms de variables, jamais leurs valeurs.
 */

const DEFAULT_URLS = {
  scaleway: "https://api.scaleway.ai/v1",
  mistral: "https://api.mistral.ai/v1",
} as const;

const model = z.string().regex(/^[A-Za-z0-9._:/-]{2,100}$/);

const configSchema = z
  .object({
    APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
    AI_PROVIDER: z
      .enum(["simulated", "scaleway", "mistral"])
      .default("simulated"),
    AI_API_KEY: z.string().min(20).optional(),
    AI_BASE_URL: z.url({ protocol: /^https$/ }).optional(),
    AI_TEXT_MODEL: model.optional(),
    AI_VISION_MODEL: model.optional(),
    AI_TRANSCRIPTION_MODEL: model.optional(),
  })
  .superRefine((env, context) => {
    if (env.AI_PROVIDER === "simulated") {
      if (env.APP_ENV !== "local")
        context.addIssue({
          code: "custom",
          path: ["AI_PROVIDER"],
          message: "simulé interdit hors local",
        });
      return;
    }
    for (const key of [
      "AI_API_KEY",
      "AI_TEXT_MODEL",
      "AI_VISION_MODEL",
      "AI_TRANSCRIPTION_MODEL",
    ] as const)
      if (!env[key])
        context.addIssue({ code: "custom", path: [key], message: "requis" });
  });

export type AiConfig =
  | { mode: "simulated" }
  | {
      mode: "scaleway" | "mistral";
      baseUrl: string;
      apiKey: string;
      models: { text: string; vision: string; transcription: string };
    };

export function aiConfig(source: Record<string, string | undefined>): AiConfig {
  const result = configSchema.safeParse(source);
  if (!result.success) {
    const names = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new Error(`Configuration invalide : ${names.join(", ")}`);
  }
  const env = result.data;
  if (env.AI_PROVIDER === "simulated") return { mode: "simulated" };
  return {
    mode: env.AI_PROVIDER,
    baseUrl: env.AI_BASE_URL ?? DEFAULT_URLS[env.AI_PROVIDER],
    apiKey: env.AI_API_KEY ?? "",
    models: {
      text: env.AI_TEXT_MODEL ?? "",
      vision: env.AI_VISION_MODEL ?? "",
      transcription: env.AI_TRANSCRIPTION_MODEL ?? "",
    },
  };
}

export function aiGatewayFor(
  config: AiConfig,
  fetcher: typeof fetch = globalThis.fetch,
): AiGateway {
  return config.mode === "simulated"
    ? fakeAiGateway
    : apiAiGateway({ fetch: fetcher, ...config });
}

let configured: AiGateway | undefined;

/** Passerelle IA du processus, configurée et validée une seule fois. */
export function configuredAiGateway(): AiGateway {
  configured ??= aiGatewayFor(aiConfig(process.env));
  return configured;
}
