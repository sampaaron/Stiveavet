import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

import { z } from "zod";

import { assertStorageKey } from "./types";
import type { ObjectStorage } from "./types";

/**
 * Stockage objet local (phase 2, ADR 0019) : un dossier privé de la machine joue le bucket.
 * Chaque objet est un fichier lisible par le seul processus (0600), accompagné de son type
 * de contenu. Aucun serveur de fichiers : seule l'application lit ce dossier.
 */
const meta = z.object({ contentType: z.string().min(3).max(80) });

export function createLocalStorage(root: string): ObjectStorage {
  const base = resolve(root);

  function pathOf(key: string): string {
    assertStorageKey(key);
    const path = resolve(base, key);
    // Défense en profondeur : la clé validée ne peut pas sortir du dossier.
    if (!path.startsWith(`${base}${sep}`))
      throw new Error("Clé d'objet invalide");
    return path;
  }

  return {
    simulated: true,
    async putObject(key, object) {
      const path = pathOf(key);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      // « wx » : jamais d'écrasement d'un objet existant.
      await writeFile(path, object.bytes, { flag: "wx", mode: 0o600 });
      await writeFile(
        `${path}.meta.json`,
        JSON.stringify({ contentType: object.contentType }),
        { flag: "wx", mode: 0o600 },
      );
    },
    async getObject(key) {
      const path = pathOf(key);
      try {
        const [bytes, raw] = await Promise.all([
          readFile(path),
          readFile(`${path}.meta.json`, "utf8"),
        ]);
        const parsed = meta.parse(JSON.parse(raw));
        return {
          bytes: new Uint8Array(bytes),
          contentType: parsed.contentType,
        };
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
    async deleteObject(key) {
      const path = pathOf(key);
      await rm(path, { force: true });
      await rm(`${path}.meta.json`, { force: true });
    },
    async hasObject(key) {
      try {
        await stat(pathOf(key));
        return true;
      } catch (error) {
        if (isMissing(error)) return false;
        throw error;
      }
    },
  };
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

/** Dossier par défaut, hors du dépôt versionné (voir .gitignore). */
export function defaultStorageRoot(): string {
  return join(process.cwd(), ".data", "objets");
}
