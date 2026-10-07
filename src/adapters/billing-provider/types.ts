/** Prélèvement des factures (prestataire à décider, ADR 0004 et 0011). */
export type CollectionResult = {
  status: "succeeded" | "failed";
  /** Référence de l'opération chez le prestataire (simulée : `sim_…`). */
  providerRef: string;
};

export type BillingProvider = {
  readonly simulated: boolean;
  /** Prélève une facture sur le mandat du cabinet ; aucune donnée bancaire ne transite ici. */
  collect(input: {
    organizationId: string;
    invoiceId: string;
    amountCents: number;
  }): Promise<CollectionResult>;
};
