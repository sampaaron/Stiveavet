import { z } from "zod";

import { GRAPH_API_URL, GRAPH_API_VERSION } from "./cloud-api";

/**
 * Inscription intégrée de Meta (« Embedded Signup », ADR 0024), côté serveur. Le cabinet
 * se connecte à Meta dans une fenêtre de Meta ; Stivea Vet ne reçoit qu'un code à usage
 * unique (30 secondes) et les identifiants du compte et du numéro choisis. Ici :
 * 1. le code est échangé contre le jeton propre au cabinet (avec le secret de l'application,
 *    donc seulement pour un code émis pour Stivea Vet) ;
 * 2. le numéro est vérifié comme appartenant bien au compte annoncé ;
 * 3. l'application est abonnée aux webhooks du compte ;
 * 4. le numéro est inscrit à l'API, avec le code PIN de vérification en deux étapes.
 * Aucun jeton, code, PIN ou numéro n'apparaît dans les erreurs : seulement l'étape.
 */

export type SignupStep = "exchange" | "phone" | "subscribe" | "register";

export class SignupError extends Error {
  constructor(readonly step: SignupStep) {
    super(`Inscription WhatsApp refusée (${step})`);
    this.name = "SignupError";
  }
}

export const signupInput = z.object({
  code: z.string().regex(/^[A-Za-z0-9_.#-]{10,1024}$/),
  wabaId: z.string().regex(/^[0-9]{5,30}$/),
  phoneNumberId: z.string().regex(/^[0-9]{5,30}$/),
  pin: z.string().regex(/^[0-9]{6}$/),
});
export type SignupInput = z.infer<typeof signupInput>;

export type SignupResult = {
  accessToken: string;
  /** Numéro affiché par Meta (« +33 6 12 34 56 78 »), à masquer avant tout affichage. */
  displayPhone: string;
};

export type EmbeddedSignup = {
  complete(input: SignupInput): Promise<SignupResult>;
};

const tokenResponse = z.object({ access_token: z.string().min(20).max(2048) });
const phoneList = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      display_phone_number: z.string().min(5).max(40),
    }),
  ),
});
const success = z.object({ success: z.literal(true) });

export function embeddedSignup(options: {
  fetch: typeof fetch;
  appId: string;
  appSecret: string;
  baseUrl?: string;
  version?: string;
  timeoutMs?: number;
}): EmbeddedSignup {
  const base = `${options.baseUrl ?? GRAPH_API_URL}/${options.version ?? GRAPH_API_VERSION}`;
  const timeoutMs = options.timeoutMs ?? 15_000;

  async function call<T>(
    step: SignupStep,
    schema: z.ZodType<T>,
    path: string,
    init: { method: "GET" | "POST"; token?: string; body?: unknown },
  ): Promise<T> {
    try {
      const response = await options.fetch(`${base}/${path}`, {
        method: init.method,
        headers: {
          ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
          ...(init.body ? { "content-type": "application/json" } : {}),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const parsed = schema.safeParse(await response.json());
      if (response.ok && parsed.success) return parsed.data;
    } catch {
      // Réseau, délai ou réponse illisible : même refus, sans détail.
    }
    throw new SignupError(step);
  }

  return {
    async complete(raw) {
      const input = signupInput.parse(raw);
      const query = new URLSearchParams({
        client_id: options.appId,
        client_secret: options.appSecret,
        code: input.code,
      });
      const { access_token: accessToken } = await call(
        "exchange",
        tokenResponse,
        `oauth/access_token?${query.toString()}`,
        { method: "GET" },
      );
      const phones = await call(
        "phone",
        phoneList,
        `${input.wabaId}/phone_numbers?fields=id,display_phone_number`,
        { method: "GET", token: accessToken },
      );
      const phone = phones.data.find((row) => row.id === input.phoneNumberId);
      if (!phone) throw new SignupError("phone");
      await call("subscribe", success, `${input.wabaId}/subscribed_apps`, {
        method: "POST",
        token: accessToken,
      });
      await call("register", success, `${input.phoneNumberId}/register`, {
        method: "POST",
        token: accessToken,
        body: { messaging_product: "whatsapp", pin: input.pin },
      });
      return { accessToken, displayPhone: phone.display_phone_number };
    },
  };
}
