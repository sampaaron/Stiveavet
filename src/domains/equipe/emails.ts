import type { EmailMessage } from "@/adapters/email/types";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function invitationEmail(
  to: string,
  details: {
    organizationName: string;
    displayName: string;
    url: string;
    days: number;
  },
): EmailMessage {
  const lines = [
    `Bonjour ${details.displayName},`,
    `Vous êtes invité à rejoindre ${details.organizationName} sur Stivea Vet.`,
    `Pour créer votre compte, ouvrez ce lien dans les ${details.days} jours : ${details.url}`,
    "Il ne fonctionne qu'une fois. Si vous ne connaissez pas ce cabinet, ignorez ce message.",
    "L'équipe Stivea Vet",
  ];
  return {
    to,
    subject: `Invitation à rejoindre ${details.organizationName} sur Stivea Vet`,
    text: lines.join("\n\n"),
    html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join(""),
  };
}
