import { z } from "zod";

import { scalewayQueue } from "./scaleway-queues";

/**
 * Réveil du worker (ADR 0028). Sans file (`none`, défaut), le worker interroge PostgreSQL à
 * intervalle fixe. Avec Scaleway Queues, l'application dépose un signal après chaque
 * transaction qui a inscrit une tâche, et le worker attend ce signal au lieu de dormir :
 * une tâche part en une seconde au lieu de cinq. Le signal ne porte aucune donnée.
 */

const configSchema = z
  .object({
    QUEUE_PROVIDER: z.enum(["none", "scaleway"]).default("none"),
    SCW_QUEUE_URL: z.url({ protocol: /^https$/ }).optional(),
    SCW_QUEUE_ACCESS_KEY: z.string().min(16).max(128).optional(),
    SCW_QUEUE_SECRET_KEY: z.string().min(16).max(256).optional(),
  })
  .superRefine((env, context) => {
    if (env.QUEUE_PROVIDER === "scaleway")
      for (const key of [
        "SCW_QUEUE_URL",
        "SCW_QUEUE_ACCESS_KEY",
        "SCW_QUEUE_SECRET_KEY",
      ] as const)
        if (!env[key])
          context.addIssue({ code: "custom", path: [key], message: "requis" });
  });

export type WakeChannel = {
  /** Signal déposé après la validation d'une transaction qui a inscrit une tâche. */
  notify(): Promise<void>;
  /** Attente du worker entre deux passages : jusqu'au prochain signal, ou `ms` au plus. */
  wait(ms: number): Promise<void>;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Configuration validée ; une erreur ne cite que des noms de variables, jamais leurs valeurs. */
export function wakeChannel(
  source: Record<string, string | undefined>,
  fetcher: typeof fetch = globalThis.fetch,
): WakeChannel {
  const result = configSchema.safeParse(source);
  if (!result.success) {
    const names = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new Error(`Configuration invalide : ${names.join(", ")}`);
  }
  const env = result.data;
  if (env.QUEUE_PROVIDER === "none")
    return { notify: () => Promise.resolve(), wait: sleep };
  const queue = scalewayQueue({
    fetch: fetcher,
    queueUrl: env.SCW_QUEUE_URL ?? "",
    credentials: {
      accessKeyId: env.SCW_QUEUE_ACCESS_KEY ?? "",
      secretAccessKey: env.SCW_QUEUE_SECRET_KEY ?? "",
    },
  });
  return {
    notify: () => queue.send("wake"),
    async wait(ms) {
      try {
        await queue.remove(await queue.receive(Math.ceil(ms / 1000)));
      } catch {
        // File injoignable : le worker retombe sur l'attente fixe, rien n'est perdu.
        await sleep(ms);
      }
    },
  };
}
