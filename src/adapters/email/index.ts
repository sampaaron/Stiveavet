import "server-only";

import { emailConfig, senderFor } from "./config";
import type { EmailKind } from "./config";
import type { EmailSender } from "./types";

/** Expéditeurs de l'application, créés au premier envoi (ADR 0028). */
const senders: Partial<Record<EmailKind, EmailSender>> = {};

function sender(kind: EmailKind): EmailSender {
  senders[kind] ??= senderFor(emailConfig(process.env), kind);
  return senders[kind];
}

export function emailSender(): EmailSender {
  return sender("service");
}

export function marketingEmailSender(): EmailSender {
  return sender("marketing");
}

export type { EmailMessage, EmailSender } from "./types";
