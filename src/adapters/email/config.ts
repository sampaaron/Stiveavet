import { z } from "zod";

import { scalewayEmailSender } from "./scaleway";
import { SmtpEmailSender } from "./smtp";
import type { EmailSender } from "./types";

/**
 * Choix de l'expéditeur (ADR 0028), avec une coupure franche :
 * - `smtp` : Mailpit, poste local seulement (les messages sont capturés, jamais délivrés) ;
 * - `scaleway` : Scaleway Transactional Email, clé, projet et domaine d'envoi obligatoires.
 * Deux expéditeurs (architecture §10) : service (codes, factures, équipe) et commercial,
 * désinscriptible et sans aucune donnée clinique.
 */

export type EmailKind = "service" | "marketing";

const LOCAL_DOMAIN = "stivea.test";
const MAILBOX: Record<EmailKind, string> = {
  service: "securite",
  marketing: "bonjour",
};

const configSchema = z
  .object({
    APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
    EMAIL_PROVIDER: z.enum(["smtp", "scaleway"]).default("smtp"),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SCW_SECRET_KEY: z.uuid().optional(),
    SCW_DEFAULT_PROJECT_ID: z.uuid().optional(),
    EMAIL_DOMAIN: z
      .string()
      .regex(/^(?=.{4,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/)
      .optional(),
  })
  .superRefine((env, context) => {
    const issue = (path: string) =>
      context.addIssue({ code: "custom", path: [path], message: "invalide" });
    if (env.EMAIL_PROVIDER === "smtp") {
      if (env.APP_ENV !== "local") issue("EMAIL_PROVIDER");
      if (!env.SMTP_HOST) issue("SMTP_HOST");
      if (!env.SMTP_PORT) issue("SMTP_PORT");
      return;
    }
    for (const key of [
      "SCW_SECRET_KEY",
      "SCW_DEFAULT_PROJECT_ID",
      "EMAIL_DOMAIN",
    ] as const)
      if (!env[key]) issue(key);
  });

export type EmailConfig =
  | { mode: "smtp"; host: string; port: number }
  | { mode: "scaleway"; secretKey: string; projectId: string; domain: string };

/** Configuration validée ; une erreur ne cite que des noms de variables, jamais leurs valeurs. */
export function emailConfig(
  source: Record<string, string | undefined>,
): EmailConfig {
  const result = configSchema.safeParse(source);
  if (!result.success) {
    const names = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new Error(`Configuration invalide : ${names.join(", ")}`);
  }
  const env = result.data;
  if (env.EMAIL_PROVIDER === "smtp")
    return {
      mode: "smtp",
      host: env.SMTP_HOST ?? "",
      port: env.SMTP_PORT ?? 0,
    };
  return {
    mode: "scaleway",
    secretKey: env.SCW_SECRET_KEY ?? "",
    projectId: env.SCW_DEFAULT_PROJECT_ID ?? "",
    domain: env.EMAIL_DOMAIN ?? "",
  };
}

export function senderFor(
  config: EmailConfig,
  kind: EmailKind,
  fetcher: typeof fetch = globalThis.fetch,
): EmailSender {
  if (config.mode === "smtp")
    return new SmtpEmailSender(
      config.host,
      config.port,
      `Stivea Vet <${MAILBOX[kind]}@${LOCAL_DOMAIN}>`,
    );
  return scalewayEmailSender({
    fetch: fetcher,
    secretKey: config.secretKey,
    projectId: config.projectId,
    from: { email: `${MAILBOX[kind]}@${config.domain}`, name: "Stivea Vet" },
  });
}
