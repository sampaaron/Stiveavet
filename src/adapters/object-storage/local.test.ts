import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { createLocalStorage } from "./local";

const root = await mkdtemp(join(tmpdir(), "stivea-objets-"));
const storage = createLocalStorage(root);
const key = "o/organisation/suivis/dossier/fichier.png";
const object = { bytes: Uint8Array.from([1, 2, 3]), contentType: "image/png" };

afterAll(() => rm(root, { recursive: true, force: true }));

describe("stockage objet local", () => {
  it("dépose, relit, refuse d'écraser, puis supprime", async () => {
    await storage.putObject(key, object);
    expect(await storage.getObject(key)).toEqual(object);
    expect(await storage.hasObject(key)).toBe(true);
    // Fichier lisible par le seul processus.
    expect((await stat(join(root, key))).mode & 0o077).toBe(0);
    await expect(storage.putObject(key, object)).rejects.toThrow();
    await storage.deleteObject(key);
    expect(await storage.getObject(key)).toBeNull();
    expect(await storage.hasObject(key)).toBe(false);
    // Rejouable.
    await storage.deleteObject(key);
  });

  it("refuse toute clé qui sortirait du dossier ou ne suit pas le format", async () => {
    for (const bad of [
      "o/../../etc/passwd",
      "../secret-file",
      "/absolu/fichier",
      "O/MAJUSCULES/x",
      "o//double-barre",
      "court",
    ])
      await expect(storage.putObject(bad, object)).rejects.toThrow(
        "Clé d'objet invalide",
      );
  });
});
