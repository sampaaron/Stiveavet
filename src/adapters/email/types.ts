export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** En-têtes supplémentaires (désinscription en un clic des e-mails commerciaux). */
  headers?: Record<string, string>;
};

/** Envoi d'e-mails. Implémentations : Mailpit en local, mémoire en test. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
