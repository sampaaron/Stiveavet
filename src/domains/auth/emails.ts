import type { EmailMessage } from "@/adapters/email/types";

import { AUTH_POLICY } from "./policy";

const signature = "L'équipe Stivea Vet";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function message(to: string, subject: string, lines: string[]): EmailMessage {
  return {
    to,
    subject,
    text: [...lines, "", signature].join("\n"),
    html: [...lines, signature]
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join(""),
  };
}

export function securityCodeEmail(to: string, code: string): EmailMessage {
  return message(to, `Votre code de sécurité Stivea Vet : ${code}`, [
    `Votre code de sécurité : ${code}`,
    `Il est valable ${AUTH_POLICY.codeMinutes} minutes et ne sert qu'une fois.`,
    "Si vous n'êtes pas à l'origine de cette connexion, changez votre mot de passe : quelqu'un le connaît.",
  ]);
}

export function existingAccountEmail(
  to: string,
  loginUrl: string,
): EmailMessage {
  return message(to, "Un compte Stivea Vet existe déjà avec cette adresse", [
    "Quelqu'un vient de demander la création d'un compte Stivea Vet avec votre adresse e-mail, qui en possède déjà un.",
    `Si c'est vous, connectez-vous : ${loginUrl}`,
    "Sinon, vous pouvez ignorer ce message : aucun compte n'a été créé.",
  ]);
}

export function passwordResetEmail(to: string, resetUrl: string): EmailMessage {
  return message(to, "Réinitialiser votre mot de passe Stivea Vet", [
    `Pour choisir un nouveau mot de passe, ouvrez ce lien dans les ${AUTH_POLICY.resetMinutes} minutes : ${resetUrl}`,
    "Il ne fonctionne qu'une fois. Toutes vos sessions ouvertes seront fermées.",
    "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
  ]);
}

export function passwordChangedEmail(to: string): EmailMessage {
  return message(to, "Votre mot de passe Stivea Vet a été modifié", [
    "Le mot de passe de votre compte vient d'être modifié et toutes vos sessions ont été fermées.",
    "Si vous n'êtes pas à l'origine de ce changement, contactez immédiatement le vétérinaire administrateur de votre cabinet.",
  ]);
}
