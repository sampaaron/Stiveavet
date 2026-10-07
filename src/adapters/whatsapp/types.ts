/** Connexion du numéro WhatsApp Business du cabinet (prestataire à décider, ADR 0004). */
export type WhatsAppConnector = {
  readonly simulated: boolean;
  /** Vérifie et associe le numéro professionnel ; renvoie un libellé déjà masqué. */
  connectBusinessNumber(phone: string): Promise<{ displayLabel: string }>;
  /**
   * Envoie un message depuis le numéro du cabinet. La clé d'idempotence est transmise au
   * prestataire : un envoi rejoué avec la même clé ne produit jamais de second message.
   * Ni le numéro ni le texte ne sont journalisés.
   */
  sendMessage(input: {
    to: string;
    body: string;
    idempotencyKey: string;
  }): Promise<{ externalRef: string }>;
};
