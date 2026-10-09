import { sha256, signRequest } from "@/adapters/scaleway/sigv4";
import type { Credentials } from "@/adapters/scaleway/sigv4";

import { assertStorageKey } from "./types";
import type { ObjectStorage } from "./types";

/**
 * Scaleway Object Storage, région Paris, par son API compatible S3 (ADR 0019, 0028). Bucket
 * privé : aucun objet n'a d'URL publique, la lecture passe par les liens signés de
 * l'application. Une erreur ne porte qu'un code HTTP, jamais la clé de l'objet.
 */

export class StorageError extends Error {
  constructor(readonly status: number) {
    super(`stockage:${status}`);
  }
}

export function scalewayStorage(options: {
  fetch: typeof fetch;
  bucket: string;
  credentials: Credentials;
  endpoint?: string;
}): ObjectStorage {
  const base = new URL(
    options.endpoint ?? `https://${options.bucket}.s3.fr-par.scw.cloud`,
  );

  async function call(
    method: "GET" | "HEAD" | "PUT" | "DELETE",
    key: string,
    body: Uint8Array = new Uint8Array(),
    extra: Record<string, string> = {},
  ): Promise<Response> {
    assertStorageKey(key);
    const url = new URL(`/${key}`, base);
    const headers = signRequest({
      method,
      url,
      headers: { ...extra, "x-amz-content-sha256": sha256(body) },
      body,
      credentials: options.credentials,
      region: "fr-par",
      service: "s3",
    });
    try {
      return await options.fetch(url, {
        method,
        headers,
        body: method === "PUT" ? Buffer.from(body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new StorageError(0);
    }
  }

  const exists = async (key: string) => {
    const response = await call("HEAD", key);
    if (response.status === 404) return false;
    if (!response.ok) throw new StorageError(response.status);
    return true;
  };

  return {
    simulated: false,
    async putObject(key, object) {
      // Jamais d'écrasement : écriture conditionnelle, refusée si la clé existe (412).
      const response = await call("PUT", key, object.bytes, {
        "content-type": object.contentType,
        "if-none-match": "*",
      });
      if (!response.ok) throw new StorageError(response.status);
    },
    async getObject(key) {
      const response = await call("GET", key);
      if (response.status === 404) return null;
      if (!response.ok) throw new StorageError(response.status);
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        contentType:
          response.headers.get("content-type") ?? "application/octet-stream",
      };
    },
    async deleteObject(key) {
      const response = await call("DELETE", key);
      if (!response.ok && response.status !== 404)
        throw new StorageError(response.status);
    },
    hasObject: exists,
  };
}
