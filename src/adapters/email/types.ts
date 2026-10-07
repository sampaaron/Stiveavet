export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

/** Envoi d'e-mails transactionnels. Implémentations : Mailpit en local, mémoire en test. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
