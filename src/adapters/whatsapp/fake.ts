import type { WhatsAppConnector } from "./types";

/** Masque un numéro : seuls les deux derniers chiffres restent lisibles. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `•• •• •• •• ${digits.slice(-2)}`;
}

/** Simulation : aucun appel réseau, aucun compte. Le numéro complet n'est jamais conservé. */
export const fakeWhatsApp: WhatsAppConnector = {
  simulated: true,
  async connectBusinessNumber(phone) {
    return { displayLabel: `${maskPhone(phone)} (simulé)` };
  },
};
