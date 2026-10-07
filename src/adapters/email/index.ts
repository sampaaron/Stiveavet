import "server-only";

import { serverEnv } from "@/server/env";

import { SmtpEmailSender } from "./smtp";
import type { EmailSender } from "./types";

/**
 * Deux expéditeurs distincts (architecture §10) : les e-mails de service (codes, factures,
 * équipe) et les e-mails commerciaux, désinscriptibles et sans aucune donnée clinique.
 */
const FROM = {
  service: "Stivea Vet <securite@stivea.test>",
  marketing: "Stivea Vet <bonjour@stivea.test>",
} as const;

const senders: Partial<Record<keyof typeof FROM, EmailSender>> = {};

function localSender(kind: keyof typeof FROM): EmailSender {
  const existing = senders[kind];
  if (existing) return existing;
  const env = serverEnv();
  if (env.APP_ENV !== "local")
    throw new Error(
      "Aucun prestataire d'e-mail réel n'est autorisé pour le moment (ADR 0004)",
    );
  if (!env.SMTP_HOST || !env.SMTP_PORT)
    throw new Error("Configuration invalide : SMTP_HOST, SMTP_PORT");
  const sender = new SmtpEmailSender(env.SMTP_HOST, env.SMTP_PORT, FROM[kind]);
  senders[kind] = sender;
  return sender;
}

export function emailSender(): EmailSender {
  return localSender("service");
}

export function marketingEmailSender(): EmailSender {
  return localSender("marketing");
}

export type { EmailMessage, EmailSender } from "./types";
