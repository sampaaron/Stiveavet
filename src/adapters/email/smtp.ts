import "server-only";

import nodemailer from "nodemailer";

import type { EmailMessage, EmailSender } from "./types";

/**
 * Envoi SMTP vers Mailpit (local et CI) : les messages sont capturés, aucun n'est délivré.
 * Le prestataire réel sera une autre implémentation, ajoutée sur décision explicite (ADR 0004).
 */
export class SmtpEmailSender implements EmailSender {
  private readonly transport;

  constructor(
    host: string,
    port: number,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport({
      host,
      port,
      secure: false,
      ignoreTLS: true,
      // Aucune authentification : Mailpit local uniquement.
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}
