import type { TenantTransaction } from "@/server/db/tenant";

/**
 * Mandat de prélèvement SEPA (ADR 0004, 0027). Simulé : un simple libellé. Réel : la page
 * Stripe où le cabinet saisit son IBAN ; le mandat n'est connecté qu'à la réception de
 * l'événement signé de Stripe.
 */
export type PaymentMandateProvider =
  | {
      readonly simulated: true;
      /** Signature simulée ; renvoie un libellé sans donnée bancaire. */
      signMandate(organizationName: string): Promise<{ displayLabel: string }>;
    }
  | {
      readonly simulated: false;
      /** Adresse de la page de signature, pour le cabinet de la transaction. */
      startMandate(
        tx: TenantTransaction,
        input: {
          organizationId: string;
          organizationName: string;
          /** Membre qui ouvre la page : auteur de la connexion une fois le mandat signé. */
          membershipId: string;
          locale: "fr" | "en";
        },
      ): Promise<string>;
      /** Retire le moyen de paiement chez le prestataire ; plus aucun prélèvement possible. */
      revokeMandate(tx: TenantTransaction): Promise<void>;
    };
