import { z } from "zod";

import { cloudApiConnector } from "@/adapters/whatsapp/cloud-api";
import { fakeWhatsApp } from "@/adapters/whatsapp/fake";
import { embeddedSignup } from "@/adapters/whatsapp/inscription";
import type { EmbeddedSignup } from "@/adapters/whatsapp/inscription";
import { WhatsAppSendError } from "@/adapters/whatsapp/types";
import type { WhatsAppConnector } from "@/adapters/whatsapp/types";
import { parseSecretKeys, secretBox } from "@/server/crypto/secret-box";
import type { SecretBox } from "@/server/crypto/secret-box";
import { whatsappAccounts } from "@/server/db/schema";
import type { TenantTransaction } from "@/server/db/tenant";

/**
 * Choix du connecteur WhatsApp (ADR 0024), avec une coupure franche :
 * - `simulated` : poste local seulement, jamais en staging ni en production ;
 * - `cloud_api` : WhatsApp Cloud API de Meta, seulement si toutes ses clés sont présentes.
 * Le connecteur réel est propre à chaque cabinet : son numéro et son jeton, déchiffré au
 * moment de l'envoi, jamais gardé en mémoire au-delà.
 */

export type WhatsAppProvider = {
  readonly live: boolean;
  /** Groupes WhatsApp possibles : simulés seulement (réservés chez Meta aux comptes officiels). */
  readonly groups: boolean;
  /** Connecteur du numéro du cabinet de la transaction. */
  connectorFor(tx: TenantTransaction): Promise<WhatsAppConnector>;
};

export function simulatedProvider(
  connector: WhatsAppConnector = fakeWhatsApp,
): WhatsAppProvider {
  return {
    live: false,
    groups: connector.groups,
    connectorFor: async () => connector,
  };
}

/** Contexte authentifié du jeton chiffré : il ne se déchiffre que pour son cabinet. */
export function tokenContext(organizationId: string): string {
  return `whatsapp-token:${organizationId}`;
}

export function liveProvider(deps: {
  fetch: typeof fetch;
  box: SecretBox;
  baseUrl?: string;
}): WhatsAppProvider {
  return {
    live: true,
    groups: false,
    async connectorFor(tx) {
      const [account] = await tx.select().from(whatsappAccounts);
      // Numéro pas (ou plus) connecté : tout envoi attend une reconnexion.
      if (!account) throw new WhatsAppSendError("account", "not_connected");
      let accessToken: string;
      try {
        accessToken = deps.box.open(
          account.accessTokenSealed,
          tokenContext(account.organizationId),
        );
      } catch {
        throw new WhatsAppSendError("account", "token_unreadable");
      }
      return cloudApiConnector({
        fetch: deps.fetch,
        phoneNumberId: account.phoneNumberId,
        accessToken,
        baseUrl: deps.baseUrl,
      });
    },
  };
}

const configSchema = z
  .object({
    APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
    WHATSAPP_PROVIDER: z.enum(["simulated", "cloud_api"]).default("simulated"),
    SECRETS_ENCRYPTION_KEYS: z.string().min(1).optional(),
    META_APP_ID: z
      .string()
      .regex(/^[0-9]{5,30}$/)
      .optional(),
    META_APP_SECRET: z.string().min(16).optional(),
    META_EMBEDDED_SIGNUP_CONFIG_ID: z
      .string()
      .regex(/^[0-9]{5,30}$/)
      .optional(),
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().min(24).optional(),
  })
  .superRefine((env, context) => {
    if (env.WHATSAPP_PROVIDER === "simulated" && env.APP_ENV !== "local")
      context.addIssue({
        code: "custom",
        path: ["WHATSAPP_PROVIDER"],
        message: "simulé interdit hors local",
      });
    if (env.WHATSAPP_PROVIDER === "cloud_api")
      for (const key of [
        "SECRETS_ENCRYPTION_KEYS",
        "META_APP_ID",
        "META_APP_SECRET",
        "META_EMBEDDED_SIGNUP_CONFIG_ID",
        "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
      ] as const)
        if (!env[key])
          context.addIssue({ code: "custom", path: [key], message: "requis" });
  });

export type WhatsAppConfig =
  | { mode: "simulated" }
  | {
      mode: "cloud_api";
      box: SecretBox;
      appId: string;
      appSecret: string;
      embeddedSignupConfigId: string;
      webhookVerifyToken: string;
    };

/** Configuration validée ; une erreur ne cite que des noms de variables, jamais leurs valeurs. */
export function whatsappConfig(
  source: Record<string, string | undefined>,
): WhatsAppConfig {
  const result = configSchema.safeParse(source);
  if (!result.success) {
    const names = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new Error(`Configuration invalide : ${names.join(", ")}`);
  }
  const env = result.data;
  if (env.WHATSAPP_PROVIDER === "simulated") return { mode: "simulated" };
  return {
    mode: "cloud_api",
    box: secretBox(parseSecretKeys(env.SECRETS_ENCRYPTION_KEYS)),
    appId: env.META_APP_ID ?? "",
    appSecret: env.META_APP_SECRET ?? "",
    embeddedSignupConfigId: env.META_EMBEDDED_SIGNUP_CONFIG_ID ?? "",
    webhookVerifyToken: env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? "",
  };
}

export function providerFor(config: WhatsAppConfig): WhatsAppProvider {
  return config.mode === "simulated"
    ? simulatedProvider()
    : liveProvider({ fetch: globalThis.fetch, box: config.box });
}

/** Ce dont les réglages ont besoin pour connecter le numéro du cabinet. */
export type WhatsAppSetup =
  | { live: false }
  | {
      live: true;
      signup: EmbeddedSignup;
      box: SecretBox;
      /** Identifiants publics du bouton d'inscription (SDK de Meta, côté navigateur). */
      appId: string;
      configId: string;
    };

export function setupFor(
  config: WhatsAppConfig,
  fetcher: typeof fetch = globalThis.fetch,
): WhatsAppSetup {
  if (config.mode === "simulated") return { live: false };
  return {
    live: true,
    signup: embeddedSignup({
      fetch: fetcher,
      appId: config.appId,
      appSecret: config.appSecret,
    }),
    box: config.box,
    appId: config.appId,
    configId: config.embeddedSignupConfigId,
  };
}

let configured: WhatsAppConfig | undefined;

/** Configuration WhatsApp du processus, lue et validée une seule fois. */
export function configuredWhatsApp(): WhatsAppConfig {
  configured ??= whatsappConfig(process.env);
  return configured;
}
