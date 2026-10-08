import { SmtpEmailSender } from "./smtp";
import type { EmailMessage, EmailSender } from "./types";

/**
 * Expéditeur des e-mails de service envoyés par le worker (hors de Next.js, ADR 0023).
 * Comme dans l'application, seul Mailpit est autorisé pour le moment (ADR 0004) : hors du
 * poste local, l'envoi échoue et la tâche apparaît dans « Tâches en échec ».
 * Créé au premier envoi : un worker sans e-mail à envoyer ne lit pas sa configuration.
 */
export function workerEmailSender(
  env: NodeJS.ProcessEnv = process.env,
): EmailSender {
  let sender: EmailSender | null = null;
  return {
    send(message: EmailMessage) {
      if (!sender) {
        const port = Number(env.SMTP_PORT);
        if ((env.APP_ENV ?? "local") !== "local")
          throw new Error(
            "Aucun prestataire d'e-mail réel n'est autorisé pour le moment (ADR 0004)",
          );
        if (!env.SMTP_HOST || !Number.isInteger(port) || port <= 0)
          throw new Error("Configuration invalide : SMTP_HOST, SMTP_PORT");
        sender = new SmtpEmailSender(
          env.SMTP_HOST,
          port,
          "Stivea Vet <securite@stivea.test>",
        );
      }
      return sender.send(message);
    },
  };
}
