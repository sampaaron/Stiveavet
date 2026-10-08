import type { EmailMessage } from "@/adapters/email/types";

/**
 * E-mail de l'offre d'engagement annuel (ADR 0023), envoyé à qui gère la facturation. En
 * français, comme les autres e-mails de l'équipe (ADR 0022) ; aucune donnée clinique.
 */

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function annualOfferEmail(
  to: string,
  details: {
    displayName: string;
    organizationName: string;
    reason: "offer" | "reminder";
    planName: string;
    annualPrice: string;
    monthlyPrice: string;
    /** Date du prélèvement à partir duquel l'engagement commencerait. */
    startsOn: string;
    /** Date avant laquelle choisir (début du 7e mois). */
    decideBefore: string;
    url: string;
  },
): EmailMessage {
  const intro =
    details.reason === "offer"
      ? `L'essai pilote de ${details.organizationName} arrive à sa fin. Vous pouvez dès maintenant choisir l'engagement annuel pour la formule ${details.planName}.`
      : `${details.organizationName} est en formule ${details.planName} sans engagement. Vous pouvez encore passer à l'engagement annuel avant le ${details.decideBefore}.`;
  const lines = [
    `Bonjour ${details.displayName},`,
    intro,
    `Avec engagement : ${details.annualPrice} HT par mois pendant 12 mois, à partir du prélèvement du ${details.startsOn}. Sans engagement : ${details.monthlyPrice} HT par mois.`,
    "Sans réponse de votre part, vous restez au mois : rien ne bascule automatiquement.",
    `Pour choisir : ${details.url}`,
    "L'équipe Stivea Vet",
  ];
  return {
    to,
    subject:
      details.reason === "offer"
        ? "Après votre essai Stivea Vet : engagement annuel ou mensuel ?"
        : "Stivea Vet : dernier rappel pour l'engagement annuel",
    text: lines.join("\n\n"),
    html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join(""),
  };
}
