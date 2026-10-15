import { emailConfig, senderFor } from "./config";
import type { EmailMessage, EmailSender } from "./types";

/**
 * Expéditeur des e-mails de service envoyés par le worker (hors de Next.js, ADR 0023, 0028).
 * Créé au premier envoi : un worker sans e-mail à envoyer ne lit pas sa configuration, et
 * une configuration invalide fait échouer la tâche (visible dans « Tâches en échec »).
 */
export function workerEmailSender(
  env: NodeJS.ProcessEnv = process.env,
): EmailSender {
  let sender: EmailSender | null = null;
  return {
    send(message: EmailMessage) {
      sender ??= senderFor(emailConfig(env), "service");
      return sender.send(message);
    },
  };
}
