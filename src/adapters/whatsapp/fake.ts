import { createHash } from "node:crypto";

import type { WhatsAppConnector } from "./types";

/** Masque un numéro : seuls les deux derniers chiffres restent lisibles. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `•• •• •• •• ${digits.slice(-2)}`;
}

function simulatedRef(idempotencyKey: string): string {
  const digest = createHash("sha256")
    .update(idempotencyKey)
    .digest("hex")
    .slice(0, 32);
  return `simule:${digest}`;
}

/**
 * Simulation : aucun appel réseau, aucun compte. Le numéro complet n'est jamais conservé.
 * Un envoi simulé « réussit » toujours ; sa référence dérive de la clé d'idempotence, comme
 * chez un prestataire qui dédoublonne les envois rejoués.
 */
export const fakeWhatsApp: WhatsAppConnector = {
  simulated: true,
  async connectBusinessNumber(phone) {
    return { displayLabel: `${maskPhone(phone)} (simulé)` };
  },
  async sendMessage({ idempotencyKey }) {
    return { externalRef: simulatedRef(idempotencyKey) };
  },
  async sendStaffAlert({ idempotencyKey }) {
    return { externalRef: simulatedRef(idempotencyKey) };
  },
};
