import "server-only";

import { serverEnv } from "@/server/env";

import { SmtpEmailSender } from "./smtp";
import type { EmailSender } from "./types";

let sender: EmailSender | undefined;

export function emailSender(): EmailSender {
  if (!sender) {
    const env = serverEnv();
    if (env.APP_ENV !== "local")
      throw new Error(
        "Aucun prestataire d'e-mail réel n'est autorisé pour le moment (ADR 0004)",
      );
    if (!env.SMTP_HOST || !env.SMTP_PORT)
      throw new Error("Configuration invalide : SMTP_HOST, SMTP_PORT");
    sender = new SmtpEmailSender(
      env.SMTP_HOST,
      env.SMTP_PORT,
      "Stivea Vet <securite@stivea.test>",
    );
  }
  return sender;
}

export type { EmailMessage, EmailSender } from "./types";
