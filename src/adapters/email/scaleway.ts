import type { EmailMessage, EmailSender } from "./types";

/**
 * Scaleway Transactional Email, région Paris (ADR 0028). Le domaine d'envoi est vérifié chez
 * Scaleway (SPF, DKIM, DMARC). Une erreur ne porte qu'un code HTTP : jamais l'adresse, le
 * sujet ou le contenu du message, qui peut contenir un code de sécurité.
 */

export const SCALEWAY_API_URL = "https://api.scaleway.com";

export class EmailSendError extends Error {
  constructor(readonly status: number) {
    super(`email:${status}`);
  }
}

export function scalewayEmailSender(options: {
  fetch: typeof fetch;
  secretKey: string;
  projectId: string;
  from: { email: string; name: string };
  baseUrl?: string;
  timeoutMs?: number;
}): EmailSender {
  const url = `${(options.baseUrl ?? SCALEWAY_API_URL).replace(/\/+$/, "")}/transactional-email/v1alpha1/regions/fr-par/emails`;
  return {
    async send(message: EmailMessage) {
      let response: Response;
      try {
        response = await options.fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-auth-token": options.secretKey,
          },
          body: JSON.stringify({
            project_id: options.projectId,
            from: options.from,
            to: [{ email: message.to }],
            subject: message.subject,
            text: message.text,
            html: message.html,
            additional_headers: Object.entries(message.headers ?? {}).map(
              ([key, value]) => ({ key, value }),
            ),
          }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
        });
      } catch {
        throw new EmailSendError(0);
      }
      if (!response.ok) throw new EmailSendError(response.status);
    },
  };
}
