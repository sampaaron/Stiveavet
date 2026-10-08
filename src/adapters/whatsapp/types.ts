import type { TemplateKey, TemplateLanguage } from "@/domains/whatsapp/modeles";

/**
 * Connecteur WhatsApp Business d'un cabinet (architecture §9, ADR 0024) : simulé en local,
 * WhatsApp Cloud API de Meta en staging et en production. Le reste de Stivea Vet ne connaît
 * que ce contrat. Ni les numéros ni les textes ne sont journalisés.
 */

/** Ce qui part : un texte libre (fenêtre de 24 h ouverte) ou un modèle approuvé. */
export type OutboundContent =
  | { kind: "text"; body: string }
  | {
      kind: "template";
      key: TemplateKey;
      language: TemplateLanguage;
      /** Valeurs dans l'ordre du catalogue. */
      params: readonly string[];
    };

export type Recipient =
  { kind: "phone"; phone: string } | { kind: "group"; groupRef: string };

export type WhatsAppConnector = {
  readonly simulated: boolean;
  /**
   * Groupes dédiés à un suivi (cahier des charges §6). Chez Meta, ils sont réservés aux
   * comptes officiels (badge vérifié) et se rejoignent par lien d'invitation : le connecteur
   * réel ne les propose pas, et chaque propriétaire a alors sa propre conversation.
   */
  readonly groups: boolean;
  /**
   * Envoie un message depuis le numéro du cabinet. `reference` (identifiant interne du
   * message, jamais une donnée personnelle) revient avec les accusés de Meta. Meta n'offre
   * pas de clé d'idempotence : l'appelant n'envoie qu'une fois chaque message (une tâche par
   * envoi) et ne réessaie qu'après un échec qui garantit que rien n'est parti.
   */
  send(input: {
    to: Recipient;
    content: OutboundContent;
    reference: string;
  }): Promise<{ externalRef: string }>;
  createGroup(input: {
    name: string;
    members: readonly string[];
    idempotencyKey: string;
  }): Promise<{ groupRef: string }>;
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
   * Photo ou vocal envoyé par un propriétaire (webhook) : télécharge le fichier chez Meta,
   * sans dépasser `maxBytes`, et vérifie son empreinte. Le type sera relu dans le contenu.
   */
  downloadMedia(input: {
    mediaId: string;
    maxBytes: number;
  }): Promise<Uint8Array>;
};

/**
 * Échec d'envoi, classé pour décider de la suite (codes de Meta, ADR 0024) :
 * - `retry` : rien n'est parti (limite de débit, indisponibilité) ; nouvelle tentative ;
 * - `window_closed` : fenêtre de 24 h fermée ; passer par un modèle ;
 * - `unreachable` : numéro injoignable sur WhatsApp ; ne pas réessayer ;
 * - `rejected` : message refusé (modèle absent ou en pause, paramètre) ; à corriger ;
 * - `account` : compte du cabinet à reconnecter ou bloqué ; toute la file attend ;
 * - `unknown` : réponse perdue, l'envoi a pu partir ; ne pas renvoyer à l'aveugle.
 * `code` est le code technique (jamais un message brut, qui pourrait contenir un numéro).
 */
export type SendFailure =
  | "retry"
  | "window_closed"
  | "unreachable"
  | "rejected"
  | "account"
  | "unknown";

export class WhatsAppSendError extends Error {
  constructor(
    readonly failure: SendFailure,
    readonly code: string,
  ) {
    super(`whatsapp:${failure}:${code}`);
  }
}

/**
 * Échec de téléchargement d'un média :
 * - `retry` : Meta indisponible, nouvelle tentative ;
 * - `too_large` : fichier au-delà de la limite, refusé sans le télécharger en entier ;
 * - `gone` : média expiré ou inconnu chez Meta (30 jours) ; inutile de réessayer ;
 * - `integrity` : contenu différent de l'empreinte annoncée par Meta ;
 * - `account` : compte du cabinet à reconnecter.
 */
export type MediaFailure =
  "retry" | "too_large" | "gone" | "integrity" | "account";

export class WhatsAppMediaError extends Error {
  constructor(
    readonly failure: MediaFailure,
    readonly code: string,
  ) {
    super(`whatsapp-media:${failure}:${code}`);
  }
}
