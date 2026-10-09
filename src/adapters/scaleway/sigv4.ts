import { createHash, createHmac } from "node:crypto";

/**
 * Signature AWS « Signature Version 4 », utilisée par les API compatibles de Scaleway
 * (Queues, Object Storage ; ADR 0028). Tous les en-têtes passés sont signés, avec l'hôte et
 * la date ; aucun secret n'apparaît dans une erreur.
 */

const hmac = (key: Buffer | string, data: string) =>
  createHmac("sha256", key).update(data).digest();
export const sha256 = (data: string | Uint8Array) =>
  createHash("sha256").update(data).digest("hex");

export type Credentials = { accessKeyId: string; secretAccessKey: string };

export function signRequest(input: {
  method?: "GET" | "HEAD" | "PUT" | "POST" | "DELETE";
  url: URL;
  headers: Record<string, string>;
  body: string | Uint8Array;
  credentials: Credentials;
  region: string;
  service: string;
  now?: Date;
}): Record<string, string> {
  const stamp = (input.now ?? new Date())
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const day = stamp.slice(0, 8);
  const headers: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(input.headers).map(([key, value]) => [
        key.toLowerCase(),
        value.trim(),
      ]),
    ),
    host: input.url.host,
    "x-amz-date": stamp,
  };
  const names = Object.keys(headers).sort();
  const signedHeaders = names.join(";");
  const canonical = [
    input.method ?? "POST",
    input.url.pathname || "/",
    input.url.search.slice(1),
    names.map((name) => `${name}:${headers[name]}\n`).join(""),
    signedHeaders,
    sha256(input.body),
  ].join("\n");
  const scope = `${day}/${input.region}/${input.service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", stamp, scope, sha256(canonical)].join(
    "\n",
  );
  const key = [day, input.region, input.service, "aws4_request"].reduce<
    Buffer | string
  >(
    (secret, part) => hmac(secret, part),
    `AWS4${input.credentials.secretAccessKey}`,
  );
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${input.credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
