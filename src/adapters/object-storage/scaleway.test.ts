import { randomBytes, randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { storageFor } from "./index";
import { StorageError } from "./scaleway";

/**
 * Imitation d'un bucket S3 versionné : écriture conditionnelle, lecture, marqueur de
 * suppression sur un DELETE simple, effacement d'une version précise, liste des versions
 * paginée (deux entrées par page).
 */
type Version = {
  id: string;
  marker: boolean;
  bytes: Uint8Array;
  type: string;
};

function bucket() {
  const objects = new Map<string, Version[]>();
  let next = 0;
  const latest = (key: string) => objects.get(key)?.at(-1);
  const live = (key: string) => {
    const found = latest(key);
    return found && !found.marker ? found : undefined;
  };
  const listing = (url: URL) => {
    const prefix = url.searchParams.get("prefix") ?? "";
    const after = url.searchParams.get("version-id-marker");
    const entries = [...objects]
      .filter(([key]) => key.startsWith(prefix))
      .flatMap(([key, versions]) =>
        versions.map((version) => ({ key, ...version })),
      );
    const start = after
      ? entries.findIndex((entry) => entry.id === after) + 1
      : 0;
    const page = entries.slice(start, start + 2);
    const truncated = start + 2 < entries.length;
    const last = page.at(-1);
    return [
      "<ListVersionsResult>",
      `<IsTruncated>${truncated}</IsTruncated>`,
      truncated && last
        ? `<NextKeyMarker>${last.key}</NextKeyMarker><NextVersionIdMarker>${last.id}</NextVersionIdMarker>`
        : "",
      ...page.map(({ key, id, marker }) => {
        const kind = marker ? "DeleteMarker" : "Version";
        return `<${kind}><Key>${key}</Key><VersionId>${id}</VersionId></${kind}>`;
      }),
      "</ListVersionsResult>",
    ].join("");
  };
  const fetcher = (async (url: URL, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    if (!headers.authorization?.includes("/fr-par/s3/aws4_request"))
      return new Response(null, { status: 403 });
    if (url.pathname === "/")
      return url.searchParams.has("versions")
        ? new Response(listing(url))
        : new Response(null, { status: 400 });
    const key = url.pathname.slice(1);
    const versions = objects.get(key) ?? [];
    const found = live(key);
    switch (init.method) {
      case "PUT":
        if (found && headers["if-none-match"] === "*")
          return new Response(null, { status: 412 });
        objects.set(key, [
          ...versions,
          {
            id: `v${(next += 1)}`,
            marker: false,
            bytes: new Uint8Array(init.body as Buffer),
            type: headers["content-type"] ?? "",
          },
        ]);
        return new Response(null, { status: 200 });
      case "GET":
        return found
          ? new Response(Buffer.from(found.bytes), {
              headers: { "content-type": found.type },
            })
          : new Response(null, { status: 404 });
      case "HEAD":
        return new Response(null, { status: found ? 200 : 404 });
      default: {
        const versionId = url.searchParams.get("versionId");
        if (versionId === null)
          objects.set(key, [
            ...versions,
            {
              id: `m${(next += 1)}`,
              marker: true,
              bytes: new Uint8Array(),
              type: "",
            },
          ]);
        else {
          const kept = versions.filter((version) => version.id !== versionId);
          if (kept.length) objects.set(key, kept);
          else objects.delete(key);
        }
        return new Response(null, { status: 204 });
      }
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

  it("efface chaque version, marqueurs compris, sans toucher une clé voisine", async () => {
    const { objects, fetcher } = bucket();
    const storage = storageFor(env, fetcher);
    const key = "cabinets/essai/vocal-1.ogg";
    const neighbour = `${key}.copie`;
    const object = { bytes: new Uint8Array([4, 5]), contentType: "audio/ogg" };
    // Versions laissées par une suppression simple puis un nouveau dépôt, et une voisine.
    await storage.putObject(key, object);
    await fetcher(
      new URL(`https://${env.SCW_BUCKET}.s3.fr-par.scw.cloud/${key}`),
      {
        method: "DELETE",
        headers: {
          authorization:
            "AWS4-HMAC-SHA256 Credential=x/20261023/fr-par/s3/aws4_request",
        },
      },
    );
    await storage.putObject(key, object);
    await storage.putObject(neighbour, object);
    expect(objects.get(key)).toHaveLength(3);

    await storage.deleteObject(key);
    expect(objects.has(key)).toBe(false);
    expect(await storage.getObject(neighbour)).toEqual(object);
    // Rejouable : plus rien à effacer.
    await storage.deleteObject(key);
    expect([...objects.keys()]).toEqual([neighbour]);
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
