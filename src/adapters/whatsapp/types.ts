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
  /**
   * Groupe dédié à un suivi (cahier des charges §6), créé et géré par l'API professionnelle
   * du cabinet : Stivea Vet ne lit jamais un groupe personnel existant. À valider avec le
   * prestataire en phase 3 ; simulé en phase 2. Mêmes règles d'idempotence que les envois.
   */
  createGroup(input: {
    name: string;
    members: readonly string[];
    idempotencyKey: string;
  }): Promise<{ groupRef: string }>;
  sendGroupMessage(input: {
    groupRef: string;
    body: string;
    idempotencyKey: string;
  }): Promise<{ externalRef: string }>;
  removeFromGroup(input: {
    groupRef: string;
    member: string;
    idempotencyKey: string;
  }): Promise<void>;
  closeGroup(input: {
    groupRef: string;
    idempotencyKey: string;
  }): Promise<void>;
  /**
   * Alerte WhatsApp à un vétérinaire (urgence, escalade). Le texte ne contient aucun contenu
   * clinique : il invite à ouvrir Stivea Vet. Le numéro du vétérinaire est résolu par le
   * prestataire (phase 3) ; il n'est jamais journalisé.
   */
  sendStaffAlert(input: {
    membershipId: string;
    kind: "urgent" | "escalation";
    idempotencyKey: string;
  }): Promise<{ externalRef: string }>;
};
