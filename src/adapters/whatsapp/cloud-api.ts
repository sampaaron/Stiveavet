import { z } from "zod";

import { metaParameters } from "@/domains/whatsapp/modeles";

import { WhatsAppSendError } from "./types";
import type { OutboundContent, SendFailure, WhatsAppConnector } from "./types";

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
  };
}
