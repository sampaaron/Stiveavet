import type { TenantTransaction } from "@/server/db/tenant";

/** Prélèvement des factures (ADR 0011, 0027). */
export type CollectionResult = {
  /** « processing » : prélèvement SEPA envoyé, issue connue par webhook quelques jours après. */
  status: "succeeded" | "failed" | "processing";
  /** Référence de l'opération chez le prestataire (simulée : `sim_…`, Stripe : `pi_…`). */
  providerRef: string;
};

/** Prestataire injoignable ou compte refusé : la facture reste à prélever, rien n'est bloqué. */
export class BillingUnavailableError extends Error {
  constructor(readonly code: string) {
    super(`prelevement:${code}`);
  }
}

export type BillingProvider = {
  readonly simulated: boolean;
  /**
   * Prélève une facture sur le mandat du cabinet de la transaction ; aucune donnée bancaire
   * ne transite ici. `attempt` distingue un nouvel essai d'un appel rejoué.
   */
  collect(
    tx: TenantTransaction,
    input: {
      organizationId: string;
      invoiceId: string;
      invoiceNumber: string;
      amountCents: number;
      attempt: number;
    },
  ): Promise<CollectionResult>;
};
