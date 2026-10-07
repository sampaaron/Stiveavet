import type { PaymentMandateProvider } from "./types";

/** Simulation : aucune donnée bancaire n'est demandée ni conservée. */
export const fakePaymentMandate: PaymentMandateProvider = {
  simulated: true,
  async signMandate() {
    return { displayLabel: "Mandat de prélèvement simulé" };
  },
};
