import { createHash, createHmac, randomBytes } from "node:crypto";

import { z } from "zod";

import {
  TEMPLATES,
  fillTemplate,
  isTemplateKey,
} from "@/domains/whatsapp/modeles";
import type { TemplateKey, TemplateLanguage } from "@/domains/whatsapp/modeles";

/**
 * Imitation locale de l'API de Meta, pour les tests seulement (jamais branchée en staging ni
 * en production) : aucun appel réseau, aucun compte. Elle vérifie ce que Meta vérifierait
 * (jeton, forme de la requête, modèle et paramètres, fenêtre de 24 h), garde chaque envoi et
 * signe les webhooks comme Meta. Construite d'après la documentation officielle (ADR 0024).
 */

export type ImitatedSend = {
  wamid: string;
  phoneNumberId: string;
  to: string;
  reference: string | null;
} & (
  | { type: "text"; body: string }
  | {
      type: "template";
      template: TemplateKey;
      language: TemplateLanguage;
      params: string[];
      /** Texte que le propriétaire lit, rendu à partir du catalogue approuvé. */
      body: string;
    }
);

const WINDOW_MS = 24 * 3_600_000;

const textMessage = z.object({
  messaging_product: z.literal("whatsapp"),
  recipient_type: z.literal("individual"),
  to: z.string().regex(/^\+?[1-9][0-9]{7,14}$/),
  biz_opaque_callback_data: z.string().max(512).optional(),
  type: z.literal("text"),
  text: z.object({
    preview_url: z.boolean().optional(),
    body: z.string().min(1).max(4096),
  }),
});

const templateMessage = textMessage.omit({ type: true, text: true }).extend({
  type: z.literal("template"),
  template: z.object({
    name: z.string(),
    language: z.object({ code: z.enum(["fr", "en"]) }),
    components: z
      .array(
        z.object({
          type: z.literal("body"),
          parameters: z.array(
            z.object({
              type: z.literal("text"),
              parameter_name: z.string(),
              text: z.string(),
            }),
          ),
        }),
      )
      .length(1),
  }),
});

const sendRequest = z.discriminatedUnion("type", [
  textMessage,
  templateMessage,
]);

function graphError(status: number, code: number): Response {
  return Response.json(
    { error: { code, message: "Imitation", type: "OAuthException" } },
    { status },
  );
}

export type MetaImitation = ReturnType<typeof metaImitation>;

/** Média reçu d'un propriétaire, tel que Meta le garde (30 jours). */
type ImitatedMedia = {
  bytes: Uint8Array;
  mimeType: string;
  /** Ce que Meta annonce, qui peut mentir dans un test (taille, empreinte). */
  declaredSize: number;
  sha256: string;
};

const MEDIA_HOST = "lookaside.fbsbx.com";

/** Compte WhatsApp que le cabinet choisit dans la fenêtre d'inscription de Meta. */
export type ImitatedSignup = {
  code: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhone: string;
};

export function metaImitation(options: {
  accessToken: string;
  appId?: string;
  appSecret?: string;
  signup?: ImitatedSignup;
  now?: () => Date;
}) {
  const now = options.now ?? (() => new Date());
  const appId = options.appId ?? "1000000000001";
  const appSecret = options.appSecret ?? randomBytes(16).toString("hex");
  const signup = options.signup ?? null;
  const signupState = {
    codeUsed: false,
    subscribed: false,
    pin: null as string | null,
  };
  const sent: ImitatedSend[] = [];
  const lastInbound = new Map<string, number>();
  const failures: { code: number; status: number }[] = [];
  let unreachable = false;
  let counter = 0;
  const media = new Map<string, ImitatedMedia>();
  /** Téléchargements de fichiers effectivement servis (octets envoyés). */
  const downloads: { mediaId: string; bytes: number }[] = [];

  /** Média : adresse temporaire, puis fichier, toujours avec le jeton du cabinet. */
  function handleMedia(url: URL, init: RequestInit): Response | null {
    const isFile = url.hostname === MEDIA_HOST;
    const path = url.pathname.replace(/^\/v[0-9]+\.[0-9]+\//, "");
    const id = isFile
      ? url.searchParams.get("mid")
      : /^[0-9]{5,40}$/.exec(path)?.[0];
    if (!id || (init.method ?? "GET") !== "GET") return null;
    const auth = new Headers(init.headers).get("authorization");
    if (auth !== `Bearer ${options.accessToken}`) return graphError(401, 190);
    const stored = media.get(id);
    if (!stored)
      return isFile
        ? new Response(null, { status: 404 })
        : graphError(404, 100);
    if (!isFile)
      return Response.json({
        messaging_product: "whatsapp",
        id,
        url: `https://${MEDIA_HOST}/whatsapp_business/attachments/?mid=${id}`,
        mime_type: stored.mimeType,
        sha256: stored.sha256,
        file_size: stored.declaredSize,
      });
    downloads.push({ mediaId: id, bytes: stored.bytes.byteLength });
    return new Response(stored.bytes.slice(), {
      headers: { "content-type": stored.mimeType },
    });
  }

  function windowOpen(to: string): boolean {
    const at = lastInbound.get(to.replace(/^\+/, ""));
    return at !== undefined && now().getTime() - at < WINDOW_MS;
  }

  /** Inscription intégrée : échange du code, numéros du compte, abonnement, inscription. */
  function handleSignup(
    path: string,
    url: URL,
    init: RequestInit,
  ): Response | null {
    if (path === "oauth/access_token") {
      const query = url.searchParams;
      if (
        init.method !== "GET" ||
        !signup ||
        signupState.codeUsed ||
        query.get("client_id") !== appId ||
        query.get("client_secret") !== appSecret ||
        query.get("code") !== signup.code
      )
        return graphError(400, 100);
      signupState.codeUsed = true;
      return Response.json({
        access_token: options.accessToken,
        token_type: "bearer",
      });
    }
    const match =
      /^([0-9]{5,30})\/(phone_numbers|subscribed_apps|register)$/.exec(path);
    if (!match) return null;
    const auth = new Headers(init.headers).get("authorization");
    if (auth !== `Bearer ${options.accessToken}`) return graphError(401, 190);
    const [, id, action] = match;
    if (!signup) return graphError(403, 200);
    if (action === "phone_numbers" && init.method === "GET")
      return id === signup.wabaId
        ? Response.json({
            data: [
              {
                id: signup.phoneNumberId,
                display_phone_number: signup.displayPhone,
              },
            ],
          })
        : graphError(403, 200);
    if (action === "subscribed_apps" && init.method === "POST") {
      if (id !== signup.wabaId) return graphError(403, 200);
      signupState.subscribed = true;
      return Response.json({ success: true });
    }
    if (action === "register" && init.method === "POST") {
      const body = z
        .object({
          messaging_product: z.literal("whatsapp"),
          pin: z.string().regex(/^[0-9]{6}$/),
        })
        .safeParse(
          JSON.parse(typeof init.body === "string" ? init.body : "null"),
        );
      if (id !== signup.phoneNumberId || !body.success)
        return graphError(400, 100);
      signupState.pin = body.data.pin;
      return Response.json({ success: true });
    }
    return graphError(400, 100);
  }

  async function handle(url: URL, init: RequestInit): Promise<Response> {
    const path = url.pathname.replace(/^\/v[0-9]+\.[0-9]+\//, "");
    const signupResponse = handleSignup(path, url, init);
    if (signupResponse) return signupResponse;
    const mediaResponse = handleMedia(url, init);
    if (mediaResponse) return mediaResponse;
    const auth = new Headers(init.headers).get("authorization");
    if (auth !== `Bearer ${options.accessToken}`) return graphError(401, 190);
    const match = /^([0-9]{5,30})\/messages$/.exec(path);
    if (!match?.[1] || init.method !== "POST") return graphError(400, 100);
    const scripted = failures.shift();
    if (scripted) return graphError(scripted.status, scripted.code);
    if (unreachable) {
      unreachable = false;
      return graphError(400, 131026);
    }
    const parsed = sendRequest.safeParse(
      JSON.parse(typeof init.body === "string" ? init.body : "null"),
    );
    if (!parsed.success) return graphError(400, 100);
    const request = parsed.data;
    const wamid = `wamid.IMITATION${String((counter += 1)).padStart(6, "0")}`;
    const base = {
      wamid,
      phoneNumberId: match[1],
      to: request.to,
      reference: request.biz_opaque_callback_data ?? null,
    };
    if (request.type === "text") {
      if (!windowOpen(request.to)) return graphError(400, 131047);
      sent.push({ ...base, type: "text", body: request.text.body });
    } else {
      const { name, language, components } = request.template;
      if (!isTemplateKey(name)) return graphError(404, 132001);
      const expected = TEMPLATES[name].params as readonly string[];
      const values = components[0]?.parameters ?? [];
      const byName = new Map(values.map((p) => [p.parameter_name, p.text]));
      if (
        values.length !== expected.length ||
        expected.some((param) => !byName.get(param))
      )
        return graphError(400, 132000);
      if (values.some((p) => /[\n\t]| {4,}/.test(p.text)))
        return graphError(400, 132012);
      const params = expected.map((param) => byName.get(param) ?? "");
      sent.push({
        ...base,
        type: "template",
        template: name,
        language: language.code,
        params,
        body: fillTemplate(name, language.code, params),
      });
    }
    return Response.json({
      messaging_product: "whatsapp",
      contacts: [{ input: request.to, wa_id: request.to.replace(/^\+/, "") }],
      messages: [{ id: wamid }],
    });
  }

  return {
    appId,
    appSecret,
    sent,
    /** Ce que l'inscription intégrée a fait chez « Meta ». */
    signupState,
    /** `fetch` à passer au connecteur réel. */
    fetch: (async (input: string | URL | Request, init: RequestInit = {}) =>
      handle(
        new URL(input instanceof Request ? input.url : input),
        init,
      )) as typeof fetch,
    /** Le propriétaire écrit : sa fenêtre de 24 h s'ouvre. */
    userWrites(phone: string, at: Date = now()) {
      lastInbound.set(phone.replace(/^\+/, ""), at.getTime());
    },
    /** Prochaines réponses en erreur (codes de Meta), dans l'ordre. */
    failNext(code: number, status = 400) {
      failures.push({ code, status });
    },
    /** Prochain envoi : numéro absent de WhatsApp. */
    nextUnreachable() {
      unreachable = true;
    },
    downloads,
    /** Le propriétaire envoie un fichier : Meta le garde et renvoie son identifiant. */
    addMedia(
      bytes: Uint8Array,
      mimeType: string,
      declared: { size?: number; sha256?: string } = {},
    ): string {
      const id = String(9_000_000_000 + (counter += 1));
      media.set(id, {
        bytes,
        mimeType,
        declaredSize: declared.size ?? bytes.byteLength,
        sha256:
          declared.sha256 ?? createHash("sha256").update(bytes).digest("hex"),
      });
      return id;
    },
    /** Média expiré chez Meta. */
    expireMedia(id: string) {
      media.delete(id);
    },
    /** Corps signé comme Meta le signe (en-tête X-Hub-Signature-256). */
    sign(body: string): string {
      return `sha256=${createHmac("sha256", appSecret).update(body).digest("hex")}`;
    },
  };
}
