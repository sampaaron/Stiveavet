import type { EmailMessage, EmailSender } from "./types";

/** Boîte d'envoi en mémoire pour les tests : rien ne quitte le processus. */
export class MemoryEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];

  send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }

  lastTo(to: string): EmailMessage | undefined {
    return this.sent.findLast((message) => message.to === to);
  }
}
