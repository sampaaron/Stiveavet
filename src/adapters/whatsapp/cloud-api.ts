import { createHash } from "node:crypto";

import { z } from "zod";

import { metaParameters } from "@/domains/whatsapp/modeles";

import { WhatsAppMediaError, WhatsAppSendError } from "./types";
import type {
  MediaFailure,
  OutboundContent,
  SendFailure,
  WhatsAppConnector,
} from "./types";

/**
 * WhatsApp Cloud API de Meta (ADR 0024), pour un numéro de cabinet. Un seul appel par
 * envoi, sans nouvelle tentative ici : c'est la file de tâches qui décide, selon la classe
 * d'échec. Aucun numéro, texte ni jeton n'apparaît dans les erreurs.
 */

export const GRAPH_API_URL = "https://graph.facebook.com";
/** Version de l'API Graph, figée et revue à chaque mise à jour (prise en charge jusqu'en 2028). */
export const GRAPH_API_VERSION = "v25.0";

export type CloudApiOptions = {
  fetch: typeof fetch;
  phoneNumberId: string;
  accessToken: string;
  baseUrl?: string;
  version?: string;
  timeoutMs?: number;
};

const ids = z.string().regex(/^[0-9]{5,30}$/);

const sendResponse = z.object({
  messages: z.array(z.object({ id: z.string().min(1).max(200) })).min(1),
});

const mediaInfo = z.object({
  url: z.url({ protocol: /^https$/ }),
  file_size: z.coerce.number().int().nonnegative().optional(),
  sha256: z.string().optional(),
});

/**
 * Hôtes d'où Meta sert les médias. L'adresse vient de l'API authentifiée de Meta ; elle est
 * tout de même vérifiée, et aucune redirection n'est suivie (le jeton ne part nulle part ailleurs).
 */
function mediaHostAllowed(url: URL): boolean {
  const host = url.hostname;
  return [".fbsbx.com", ".whatsapp.net"].some((suffix) =>
    host.endsWith(suffix),
  );
}

/** Empreinte annoncée par Meta (hexadécimal ou base64) comparée à celle du contenu. */
function sameDigest(declared: string, bytes: Uint8Array): boolean {
  const digest = createHash("sha256").update(bytes).digest();
  if (/^[0-9a-f]{64}$/i.test(declared))
    return digest.toString("hex") === declared.toLowerCase();
  return digest.toString("base64") === declared;
}

function mediaFailure(status: number, payload: unknown): WhatsAppMediaError {
  const parsed = graphError.safeParse(payload);
  const code = parsed.success ? parsed.data.error.code : null;
  if (code !== null && classifyGraphError(code) === "account")
    return new WhatsAppMediaError("account", `meta_${code}`);
  if (status === 401 || status === 403)
    return new WhatsAppMediaError("account", `http_${status}`);
  if (status === 404 || code === 100)
    return new WhatsAppMediaError(
      "gone",
      code === null ? "http_404" : `meta_${code}`,
    );
  return new WhatsAppMediaError(
    status >= 500 || status === 429 ? "retry" : "gone",
    code === null ? `http_${status}` : `meta_${code}`,
  );
}

/** Corps lu morceau par morceau, abandonné dès qu'il dépasse la limite. */
async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    await response.body?.cancel();
    throw new WhatsAppMediaError("too_large", "content_length");
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new WhatsAppMediaError("too_large", "body");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

const graphError = z.object({
  error: z.object({ code: z.number().int() }),
});

// Codes de Meta (documentation « Error codes », relue le 8 octobre 2026).
const FAILURES: ReadonlyArray<readonly [SendFailure, readonly number[]]> = [
  ["retry", [1, 2, 4, 80007, 130429, 131000, 131016, 131056, 131057]],
  ["window_closed", [131047]],
  ["unreachable", [131021, 131026, 131050]],
  [
    "account",
    [
      0, 3, 10, 190, 368, 131005, 131031, 131037, 131042, 131045, 131048,
      133010,
    ],
  ],
];

/** Classe d'un code d'erreur Meta ; un code inconnu est un refus (pas de renvoi aveugle). */
export function classifyGraphError(code: number): SendFailure {
  for (const [failure, codes] of FAILURES)
    if (codes.includes(code)) return failure;
  return "rejected";
}

function messageBody(to: string, content: OutboundContent, reference: string) {
  const common = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    // Revient avec les accusés de Meta : relie un accusé au message même si la réponse
    // à l'envoi s'est perdue.
    biz_opaque_callback_data: reference,
  };
  if (content.kind === "text")
    return {
      ...common,
      type: "text",
      text: { preview_url: false, body: content.body },
    };
  return {
    ...common,
    type: "template",
    template: {
      name: content.key,
      language: { code: content.language },
      components: [
        {
          type: "body",
          parameters: metaParameters(content.key, content.params),
        },
      ],
    },
  };
}

export function cloudApiConnector(options: CloudApiOptions): WhatsAppConnector {
  const phoneNumberId = ids.parse(options.phoneNumberId);
  const base = `${options.baseUrl ?? GRAPH_API_URL}/${options.version ?? GRAPH_API_VERSION}`;
  const timeoutMs = options.timeoutMs ?? 15_000;

  async function post(path: string, body: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await options.fetch(`${base}/${path}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      // Délai dépassé ou connexion coupée : la requête a pu arriver chez Meta.
      throw new WhatsAppSendError("unknown", "network");
    }
    const payload: unknown = await response.json().catch(() => null);
    if (response.ok) return payload;
    const parsed = graphError.safeParse(payload);
    if (!parsed.success)
      throw new WhatsAppSendError(
        response.status >= 500 ? "unknown" : "rejected",
        `http_${response.status}`,
      );
    const { code } = parsed.data.error;
    throw new WhatsAppSendError(classifyGraphError(code), `meta_${code}`);
  }

  const noGroups = () =>
    Promise.reject(new WhatsAppSendError("rejected", "groups_unavailable"));

  return {
    simulated: false,
    groups: false,
    async send({ to, content, reference }) {
      if (to.kind !== "phone") return noGroups();
      const payload = await post(
        `${phoneNumberId}/messages`,
        messageBody(to.phone, content, reference),
      );
      const parsed = sendResponse.safeParse(payload);
      // Accepté par Meta mais réponse illisible : l'accusé fera foi.
      if (!parsed.success) throw new WhatsAppSendError("unknown", "response");
      const [message] = parsed.data.messages;
      if (!message) throw new WhatsAppSendError("unknown", "response");
      return { externalRef: message.id };
    },
    createGroup: noGroups,
    removeFromGroup: noGroups,
    closeGroup: noGroups,
    async downloadMedia({ mediaId, maxBytes }) {
      if (!/^[0-9]{5,40}$/.test(mediaId))
        throw new WhatsAppMediaError("gone", "media_id");
      const authorization = `Bearer ${options.accessToken}`;
      const get = async (url: string, failure: MediaFailure) => {
        try {
          return await options.fetch(url, {
            method: "GET",
            headers: { authorization },
            redirect: "error",
            signal: AbortSignal.timeout(timeoutMs),
          });
        } catch {
          throw new WhatsAppMediaError(failure, "network");
        }
      };
      // 1. Adresse du fichier, valable quelques minutes.
      const info = await get(
        `${base}/${mediaId}?phone_number_id=${phoneNumberId}`,
        "retry",
      );
      const payload: unknown = await info.json().catch(() => null);
      if (!info.ok) throw mediaFailure(info.status, payload);
      const parsed = mediaInfo.safeParse(payload);
      if (!parsed.success || !mediaHostAllowed(new URL(parsed.data.url)))
        throw new WhatsAppMediaError("gone", "media_url");
      if ((parsed.data.file_size ?? 0) > maxBytes)
        throw new WhatsAppMediaError("too_large", "file_size");
      // 2. Le fichier lui-même, avec le même jeton, jamais au-delà de la limite.
      const file = await get(parsed.data.url, "retry");
      if (!file.ok) {
        await file.body?.cancel();
        throw mediaFailure(file.status, null);
      }
      const bytes = await readCapped(file, maxBytes);
      if (parsed.data.sha256 && !sameDigest(parsed.data.sha256, bytes))
        throw new WhatsAppMediaError("integrity", "sha256");
      return bytes;
    },
  };
}
