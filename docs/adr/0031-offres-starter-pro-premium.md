# 0031 — Offres Starter, Pro et Premium

- Statut : accepté (14 octobre 2026), remplace les formules de l'ADR 0011 et le prix d'essai de l'ADR 0023
- Prix revus le 20 octobre 2026 : Aaron a confié la grille à l'équipe technique, « alignée sur la concurrence mais un peu moins chère », avec une bonne marge. Voir « Prix et concurrence » ci-dessous.
- Offre de lancement (−25 % les 6 premiers mois) : ADR 0037
- Migration : `0022_offres_starter_pro_premium`

## Contexte

Le cahier des charges du MVP fixe trois offres : Starter à 79 €, Pro à 129 € (offre phare) et Premium à 199 € HT par mois, avec des quotas réglables, les équipes et les intégrations avancées réservées à Premium, et des dépassements maîtrisés. Les quatre formules précédentes (Solo, Solo Pro, Clinique, Clinique Pro) et l'essai pilote à 86 € ne correspondent plus.

## Décision

1. **Catalogue unique.** `PLAN_CATALOG` (`facturation/rules.ts`) porte tout : prix mensuel, prix avec engagement annuel, places de vétérinaires et d'assistants, suivis actifs inclus, plafond des suivis actifs, Stive, intégrations avancées. L'inscription, la facturation, le site public et les e-mails lisent ce catalogue ; aucun prix n'est écrit ailleurs.

   | Offre   | Mois  | Annuel | Vétérinaires | Assistants  | Suivis inclus / plafond | Stive | dr.veto |
   | ------- | ----- | ------ | ------------ | ----------- | ----------------------- | ----- | ------- |
   | Starter | 89 €  | 76 €   | 1            | 1           | 10 / 30                 | non   | non     |
   | Pro     | 179 € | 152 €  | 2            | 2           | 30 / 50                 | oui   | non     |
   | Premium | 359 € | 305 €  | 3            | sans limite | 80 / 120                | oui   | oui     |

2. **Fin de l'essai pilote.** Le prix de l'offre s'applique dès le premier mois. Les deux premiers mois restent sans engagement possible ; l'engagement annuel est proposé au 45e jour et commence au 3e mois, comme dans l'ADR 0023.
3. **Limites appliquées côté serveur.**
   - Places : invitation, changement de rôle, réactivation et acceptation d'invitation refusés au-delà des places de l'offre (`vet_limit`, `plan_assistant_limit`). Un changement d'offre trop petite pour l'équipe est refusé.
   - Suivis : au-delà des suivis inclus, chaque lancement ou réactivation est facturé comme avant (2,50 € et 1,26 €) ; au plafond, plus aucun lancement (`plan_quota_reached`).
   - Stive : la permission `stive.use` est retirée des offres qui ne le comprennent pas.
   - dr.veto : connexion refusée hors Premium (`plan_feature_missing`) ; passer à une offre sans intégrations demande d'abord de déconnecter dr.veto (`plan_integration_connected`). Le registre des animaux (ADR 0030) permet de suivre ses patients sans logiciel connecté.
4. **Cabinets existants.** Solo devient Starter, Solo Pro devient Pro, Clinique et Clinique Pro deviennent Premium. Un cabinet sans abonnement enregistré garde les limites de Premium.

## Prix et concurrence

Relevé du 20 octobre 2026, prix HT publiés par les éditeurs :

- **VetAgent** (France), le plus proche : Starter 99 € (83 € en annuel), Pro 199 € (167 €), Premium 399 € (335 €), plus 390 € à 1 990 € d'installation. Le suivi post-opératoire et la détection d'urgence n'arrivent qu'en Premium.
- Outils de messagerie des cabinets (Vello, Weave, PetDesk, Vetstoria) : environ 200 € à 450 € par cabinet et par mois, sans suivi post-opératoire.
- Scribes IA (VetRec, CoVet) : de 50 € à 250 € par vétérinaire et par mois, sans échange avec les propriétaires.

Chaque offre est environ 10 % sous l'offre VetAgent correspondante, sans frais d'installation, et le suivi par Numa est compris dès Starter. L'engagement annuel garde environ 15 % de remise. Le coût direct d'un cabinet (conversations WhatsApp, IA, hébergement) reste une petite part du prix ; il sera mesuré sur les cabinets pilotes.

## Conséquences

- Les prix annuels (environ 15 % de remise) et les quotas sont des choix par défaut, à confirmer par Aaron ; ils se changent dans le catalogue seul.
- Les prix sont simulés tant que Stripe n'est pas branché : les produits Stripe devront reprendre ces trois offres (lot 24).
