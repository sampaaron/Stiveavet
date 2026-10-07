/** Mandat de prélèvement (prestataire de paiement à décider, ADR 0004). */
export type PaymentMandateProvider = {
  readonly simulated: boolean;
  /** Ouvre la signature du mandat chez le prestataire ; renvoie un libellé sans donnée bancaire. */
  signMandate(organizationName: string): Promise<{ displayLabel: string }>;
};
