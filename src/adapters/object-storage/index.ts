import { isAbsolute } from "node:path";

import { createLocalStorage, defaultStorageRoot } from "./local";
import type { ObjectStorage } from "./types";

let storage: ObjectStorage | undefined;

/**
 * Stockage objet de l'application et du worker. Phase 2 : dossier local uniquement
 * (`OBJECT_STORAGE_DIR`, chemin absolu) ; Scaleway Object Storage arrive en phase 3, avec
 * ses clés dans le gestionnaire de secrets (ADR 0004, ADR 0019).
 */
function objectStorage(): ObjectStorage {
  if (storage) return storage;
  if ((process.env.APP_ENV ?? "local") !== "local")
    throw new Error(
      "Aucun stockage objet réel n'est autorisé pour le moment (ADR 0019)",
    );
  const configured = process.env.OBJECT_STORAGE_DIR;
  if (configured !== undefined && !isAbsolute(configured))
    throw new Error("Configuration invalide : OBJECT_STORAGE_DIR");
  storage = createLocalStorage(configured ?? defaultStorageRoot());
  return storage;
}

/** Même stockage, ouvert seulement au premier usage (modules chargés au démarrage). */
export const lazyObjectStorage: ObjectStorage = {
  simulated: true,
  putObject: (key, object) => objectStorage().putObject(key, object),
  getObject: (key) => objectStorage().getObject(key),
  deleteObject: (key) => objectStorage().deleteObject(key),
  hasObject: (key) => objectStorage().hasObject(key),
};

export type { ObjectStorage, StoredObject } from "./types";
