import { randomBytes } from "node:crypto";

import type { BillingProvider } from "./types";

/**
 * Prélèvements simulés : aucun appel réseau. Réussis par défaut ; refusés pour les cabinets
 * listés (cabinet fictif en impayé, tests).
 */
export function fakeBillingProvider(
  options: { decline?: ReadonlySet<string> } = {},
): BillingProvider {
  return {
    simulated: true,
    async collect(_tx, { organizationId }) {
      return {
        status: options.decline?.has(organizationId) ? "failed" : "succeeded",
        providerRef: `sim_${randomBytes(8).toString("hex")}`,
      };
    },
  };
}
