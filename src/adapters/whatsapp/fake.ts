import { createHash } from "node:crypto";

import { maskPhone } from "@/domains/whatsapp/numero";

import type { WhatsAppConnector } from "./types";

function simulatedRef(key: string): string {
  const digest = createHash("sha256").update(key).digest("hex").slice(0, 32);
  return `simule:${digest}`;
}

/**
 * Simulation : aucun appel réseau, aucun compte. Le numéro complet n'est jamais conservé.
 * Un envoi simulé « réussit » toujours ; sa référence dérive de celle du message. Les groupes
 * restent simulés, comme en phase 2, pour le poste local et le simulateur du propriétaire.
 */
export const fakeWhatsApp: WhatsAppConnector = {
  simulated: true,
  groups: true,
  async send({ reference }) {
    return { externalRef: simulatedRef(reference) };
  },
  async createGroup({ idempotencyKey }) {
    return { groupRef: `${simulatedRef(idempotencyKey)}:groupe` };
  },
  async removeFromGroup() {},
  async closeGroup() {},
};

/** Libellé affiché après la connexion simulée du numéro du cabinet. */
export function simulatedNumberLabel(phone: string): string {
  return `${maskPhone(phone)} (simulé)`;
}
