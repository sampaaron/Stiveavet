/** Connexion du numéro WhatsApp Business du cabinet (prestataire à décider, ADR 0004). */
export type WhatsAppConnector = {
  readonly simulated: boolean;
  /** Vérifie et associe le numéro professionnel ; renvoie un libellé déjà masqué. */
  connectBusinessNumber(phone: string): Promise<{ displayLabel: string }>;
};
