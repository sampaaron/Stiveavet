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

/** Paramètres de requête triés et encodés comme l'exige la signature S3 (RFC 3986). */
function canonicalQuery(query: Record<string, string>): string {
  const encode = (value: string) =>
    encodeURIComponent(value).replace(
      /[!'()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  return Object.keys(query)
    .sort()
    .map((name) => `${encode(name)}=${encode(query[name] ?? "")}`)
    .join("&");
}

const VERSION_ENTRY = /<(Version|DeleteMarker)>([\s\S]*?)<\/\1>/g;
const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** Contenu du premier élément `name` d'un fragment XML de réponse S3. */
function tag(xml: string, name: string): string | undefined {
  return new RegExp(`<${name}>([^<]*)</${name}>`)
    .exec(xml)?.[1]
    ?.replace(
      /&(amp|lt|gt|quot|apos);/g,
      (_, entity: string) => XML_ENTITIES[entity] ?? "",
    );
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

  async function request(
    method: "GET" | "HEAD" | "PUT" | "DELETE",
    path: string,
    query: Record<string, string> = {},
    body: Uint8Array = new Uint8Array(),
    extra: Record<string, string> = {},
  ): Promise<Response> {
    const url = new URL(path, base);
    url.search = canonicalQuery(query);
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

  const call = (
    method: "GET" | "HEAD" | "PUT" | "DELETE",
    key: string,
    query: Record<string, string> = {},
    body?: Uint8Array,
    extra?: Record<string, string>,
  ) => {
    assertStorageKey(key);
    return request(method, `/${key}`, query, body, extra);
  };

  /** Toutes les versions de la clé, marqueurs de suppression compris (liste paginée). */
  async function versionsOf(key: string): Promise<string[]> {
    assertStorageKey(key);
    const versions: string[] = [];
    let marker: Record<string, string> = {};
    for (;;) {
      const response = await request("GET", "/", {
        versions: "",
        prefix: key,
        ...marker,
      });
      if (!response.ok) throw new StorageError(response.status);
      const xml = await response.text();
      for (const [, , entry = ""] of xml.matchAll(VERSION_ENTRY)) {
        const versionId = tag(entry, "VersionId");
        // Le préfixe ramène aussi les clés plus longues : seule la clé exacte compte.
        if (tag(entry, "Key") === key && versionId) versions.push(versionId);
      }
      if (tag(xml, "IsTruncated") !== "true") return versions;
      marker = {
        "key-marker": tag(xml, "NextKeyMarker") ?? "",
        "version-id-marker": tag(xml, "NextVersionIdMarker") ?? "",
      };
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
      const response = await call("PUT", key, {}, object.bytes, {
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
      // Bucket versionné : un DELETE simple ne poserait qu'un marqueur et garderait le
      // fichier lisible. Chaque version est donc effacée par son identifiant (ADR 0041).
      for (const versionId of await versionsOf(key)) {
        const response = await call("DELETE", key, { versionId });
        if (!response.ok && response.status !== 404)
          throw new StorageError(response.status);
      }
    },
    hasObject: exists,
  };
}
