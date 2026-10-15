import { isAbsolute } from "node:path";

import { z } from "zod";

import { createLocalStorage, defaultStorageRoot } from "./local";
import { scalewayStorage } from "./scaleway";
import type { ObjectStorage } from "./types";

/**
 * Stockage objet de l'application et du worker (ADR 0019, 0028), avec une coupure franche :
 * - `local` : dossier privé du poste (`OBJECT_STORAGE_DIR`, chemin absolu), local seulement ;
 * - `scaleway` : bucket privé Scaleway Object Storage à Paris, clés d'API obligatoires.
 */
const configSchema = z
  .object({
    APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
    STORAGE_PROVIDER: z.enum(["local", "scaleway"]).default("local"),
    OBJECT_STORAGE_DIR: z
      .string()
      .refine((value) => isAbsolute(value))
      .optional(),
    SCW_BUCKET: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/)
      .optional(),
    SCW_ACCESS_KEY: z
      .string()
      .regex(/^SCW[A-Z0-9]{17}$/)
      .optional(),
    SCW_SECRET_KEY: z.uuid().optional(),
  })
  .superRefine((env, context) => {
    const issue = (path: string) =>
      context.addIssue({ code: "custom", path: [path], message: "invalide" });
    if (env.STORAGE_PROVIDER === "local") {
      if (env.APP_ENV !== "local") issue("STORAGE_PROVIDER");
      return;
    }
    for (const key of [
      "SCW_BUCKET",
      "SCW_ACCESS_KEY",
      "SCW_SECRET_KEY",
    ] as const)
      if (!env[key]) issue(key);
  });

/** Stockage configuré ; une erreur ne cite que des noms de variables, jamais leurs valeurs. */
export function storageFor(
  source: Record<string, string | undefined>,
  fetcher: typeof fetch = globalThis.fetch,
): ObjectStorage {
  const result = configSchema.safeParse(source);
  if (!result.success) {
    const names = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new Error(`Configuration invalide : ${names.join(", ")}`);
  }
  const env = result.data;
  if (env.STORAGE_PROVIDER === "local")
    return createLocalStorage(env.OBJECT_STORAGE_DIR ?? defaultStorageRoot());
  return scalewayStorage({
    fetch: fetcher,
    bucket: env.SCW_BUCKET ?? "",
    credentials: {
      accessKeyId: env.SCW_ACCESS_KEY ?? "",
      secretAccessKey: env.SCW_SECRET_KEY ?? "",
    },
  });
}

let storage: ObjectStorage | undefined;
const objectStorage = () => (storage ??= storageFor(process.env));

/** Même stockage, ouvert seulement au premier usage (modules chargés au démarrage). */
export const lazyObjectStorage: ObjectStorage = {
  get simulated() {
    return objectStorage().simulated;
  },
  putObject: (key, object) => objectStorage().putObject(key, object),
  getObject: (key) => objectStorage().getObject(key),
  deleteObject: (key) => objectStorage().deleteObject(key),
  hasObject: (key) => objectStorage().hasObject(key),
};

export type { ObjectStorage, StoredObject } from "./types";
