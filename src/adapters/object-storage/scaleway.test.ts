import { randomBytes, randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { storageFor } from "./index";
import { StorageError } from "./scaleway";

/** Imitation d'un bucket S3 : écriture conditionnelle, lecture, suppression. */
function bucket() {
  const objects = new Map<string, { bytes: Uint8Array; type: string }>();
  const fetcher = (async (url: URL, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    if (!headers.authorization?.includes("/fr-par/s3/aws4_request"))
      return new Response(null, { status: 403 });
    const key = url.pathname;
    const found = objects.get(key);
    switch (init.method) {
      case "PUT":
        if (found && headers["if-none-match"] === "*")
          return new Response(null, { status: 412 });
        objects.set(key, {
          bytes: new Uint8Array(init.body as Buffer),
          type: headers["content-type"] ?? "",
        });
        return new Response(null, { status: 200 });
      case "GET":
        return found
          ? new Response(Buffer.from(found.bytes), {
              headers: { "content-type": found.type },
            })
          : new Response(null, { status: 404 });
      case "HEAD":
        return new Response(null, { status: found ? 200 : 404 });
      default:
        objects.delete(key);
        return new Response(null, { status: 204 });
    }
  }) as unknown as typeof fetch;
  return { objects, fetcher };
}

const env = {
  APP_ENV: "staging",
  STORAGE_PROVIDER: "scaleway",
  SCW_BUCKET: "stivea-staging-objets",
  SCW_ACCESS_KEY: `SCW${randomBytes(9).toString("hex").toUpperCase().slice(0, 17)}`,
  SCW_SECRET_KEY: randomUUID(),
};

describe("stockage Scaleway Object Storage", () => {
  it("dépose, lit, refuse d'écraser, puis supprime", async () => {
    const { fetcher } = bucket();
    const storage = storageFor(env, fetcher);
    const key = "cabinets/essai/photo-1.jpg";
    const object = {
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "image/jpeg",
    };
    await storage.putObject(key, object);
    expect(await storage.getObject(key)).toEqual(object);
    await expect(storage.putObject(key, object)).rejects.toThrow(StorageError);
    await storage.deleteObject(key);
    expect(await storage.hasObject(key)).toBe(false);
    expect(await storage.getObject(key)).toBeNull();
  });

  it("refuse une clé invalide avant tout appel", async () => {
    const storage = storageFor(env, bucket().fetcher);
    await expect(storage.getObject("../secret")).rejects.toThrow("Clé");
  });

  it("dossier local seulement en local, clés obligatoires pour Scaleway", () => {
    expect(() => storageFor({ APP_ENV: "staging" })).toThrow(
      "STORAGE_PROVIDER",
    );
    expect(() => storageFor({ ...env, SCW_SECRET_KEY: undefined })).toThrow(
      "SCW_SECRET_KEY",
    );
  });
});
