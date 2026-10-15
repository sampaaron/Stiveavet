# 0027 — Prélèvements SEPA par Stripe

- Statut : accepté (8 octobre 2026)

## Contexte

Phase 3, lot 24. La facturation (ADR 0011, 0023) est simulée. Elle émet une facture par mois d'abonnement, ajoute les suppléments au-delà de 10 suivis actifs, ouvre 30 jours de régularisation après un refus, puis bloque. Le cahier des charges impose :

- un prélèvement SEPA (France et Belgique) ;
- jamais d'IBAN chez Stivea Vet ;
- des impayés, une résiliation et l'offre annuelle du lot 20 qui restent ceux qui sont déjà écrits et testés.

## Décision

1. **Stivea Vet reste l'auteur des factures ; Stripe ne fait que prélever.** Les règles de l'essai à 86 €, de l'engagement annuel proposé à 45 jours et des suppléments sont déjà la source de vérité (`rules.ts`, testées à 100 %). Les recopier dans les abonnements Stripe ferait deux vérités qui divergeraient. Chaque facture émise donne un paiement Stripe (« PaymentIntent ») sur le mandat du cabinet.
2. **Mandat signé chez Stripe.** Les réglages ouvrent une page Stripe Checkout en mode « setup », limitée au prélèvement SEPA. L'IBAN est saisi chez Stripe et n'arrive jamais chez Stivea Vet. Seuls sont gardés les identifiants Stripe du client, du moyen de paiement et du mandat (`billing_accounts`), et le libellé « Prélèvement SEPA (Stripe) », sans aucun chiffre du compte. Le mandat n'est connecté qu'à la réception de l'événement signé `setup_intent.succeeded`, jamais au retour du navigateur. Le membre qui a ouvert la page en est l'auteur au journal (`requested_by_membership_id`).
3. **Prélèvement asynchrone.** Un prélèvement SEPA met plusieurs jours :
   - la facture passe « en cours de prélèvement » ;
   - les événements signés de Stripe la passent ensuite à « payée » ou « refusée » ;
   - un refus ouvre les 30 jours de régularisation, comme avant.

   Chaque tentative porte une clé d'idempotence (`invoice:<id>:<n>`) : deux échéances calculées en même temps, ou une requête rejouée, ne prélèvent qu'une fois. Une panne de Stripe laisse la facture « à prélever » sans bloquer le cabinet ; elle sera reprise à la synchronisation suivante.

4. **Contestation bancaire.** Le titulaire peut contester un prélèvement SEPA pendant 8 semaines (`charge.dispute.created`). Une facture payée peut alors repasser en « refusée », et c'est sa seule évolution possible ; la base le garantit. L'impayé s'ouvre comme pour un refus.
5. **Webhook signé** (`/api/webhooks/stripe`) :
   - la signature `Stripe-Signature` est vérifiée sur le corps brut, avec une tolérance de 5 minutes ;
   - chaque événement n'est traité qu'une fois (`webhook_events`) ;
   - le cabinet se déduit du client, du mandat ou du paiement Stripe déjà enregistrés, par une fonction de la base qui ne renvoie que l'identifiant du cabinet, jamais des métadonnées de l'événement ;
   - un mandat révoqué à la banque (`mandate.updated`, inactif) déconnecte le prélèvement.
6. **Coupure franche** : `BILLING_PROVIDER=simulated` est refusé hors du poste local. `stripe` exige `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET`. Une clé de production (`sk_live_`, `rk_live_`) n'est acceptée qu'en production, et une clé de test qu'ailleurs. Une erreur cite des noms de variables, jamais des valeurs.
7. **Résiliation** : aucune échéance après la date d'effet (règle existante), donc aucun prélèvement. Le mandat reste chez Stripe jusqu'à ce que le cabinet le retire dans ses réglages ; il est alors détaché chez Stripe.

## Conséquences

- Tests contre une imitation locale de l'API Stripe, sans compte ni réseau :
  - mandat signé par l'événement seulement ;
  - événement rejoué sans double paiement ni double écriture ;
  - échéances concurrentes, une seule tentative ;
  - refus puis blocage à 30 jours ;
  - contestation après paiement ;
  - résiliation sans prélèvement ;
  - signature fausse ou périmée refusée ;
  - panne de Stripe sans blocage.
- Partie B :
  - ouvrir le compte Stripe d'Aaron et activer le prélèvement SEPA ;
  - déclarer le webhook avec les cinq événements écoutés ;
  - tester en mode test avec les IBAN de test de Stripe, puis demander à l'expert-comptable de valider les factures (TVA, mentions) avant le premier vrai prélèvement.
- Une tâche planifiée reprendra la synchronisation des échéances (lot 26) ; jusque-là, elle tourne à la première requête du cabinet après une échéance.
