import { assertStorageKey } from "./types";
import type { ObjectStorage, StoredObject } from "./types";

/** Stockage en mémoire, pour les tests : même contrat que le stockage local. */
export function createMemoryStorage(): ObjectStorage & {
  keys(): string[];
} {
  const objects = new Map<string, StoredObject>();
  return {
    simulated: true,
    async putObject(key, object) {
      assertStorageKey(key);
      if (objects.has(key)) throw new Error("Objet déjà présent");
      objects.set(key, {
        bytes: new Uint8Array(object.bytes),
        contentType: object.contentType,
      });
    },
    async getObject(key) {
      assertStorageKey(key);
      const object = objects.get(key);
      return object
        ? {
            bytes: new Uint8Array(object.bytes),
            contentType: object.contentType,
          }
        : null;
    },
    async deleteObject(key) {
      assertStorageKey(key);
      objects.delete(key);
    },
    async hasObject(key) {
      assertStorageKey(key);
      return objects.has(key);
    },
    keys() {
      return [...objects.keys()];
    },
  };
}
