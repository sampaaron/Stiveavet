# 0031 — Offres Starter, Pro et Premium

- Statut : accepté (14 octobre 2026), remplace les formules de l'ADR 0011 et le prix d'essai de l'ADR 0023
- Prix revus le 20 octobre 2026 (décision d'Aaron) : Starter reste à 79 €, puis 76 € d'écart entre chaque offre ; Pro passe de 129 € à 155 €, Premium de 199 € à 231 €. Les prix annuels gardent environ 15 % de remise.
- Migration : `0022_offres_starter_pro_premium`

## Contexte

Le cahier des charges du MVP fixe trois offres : Starter à 79 €, Pro à 129 € (offre phare) et Premium à 199 € HT par mois, avec des quotas réglables, les équipes et les intégrations avancées réservées à Premium, et des dépassements maîtrisés. Les quatre formules précédentes (Solo, Solo Pro, Clinique, Clinique Pro) et l'essai pilote à 86 € ne correspondent plus.

## Décision

1. **Catalogue unique.** `PLAN_CATALOG` (`facturation/rules.ts`) porte tout : prix mensuel, prix avec engagement annuel, places de vétérinaires et d'assistants, suivis actifs inclus, plafond des suivis actifs, Stive, intégrations avancées. L'inscription, la facturation, le site public et les e-mails lisent ce catalogue ; aucun prix n'est écrit ailleurs.

   | Offre   | Mois  | Annuel | Vétérinaires | Assistants  | Suivis inclus / plafond | Stive | dr.veto |
   | ------- | ----- | ------ | ------------ | ----------- | ----------------------- | ----- | ------- |
   | Starter | 79 €  | 67 €   | 1            | 1           | 15 / 30                 | non   | non     |
   | Pro     | 155 € | 132 €  | 2            | 3           | 40 / 80                 | oui   | non     |
   | Premium | 231 € | 196 €  | 3            | sans limite | 100 / 200               | oui   | oui     |

2. **Fin de l'essai pilote.** Le prix de l'offre s'applique dès le premier mois. Les deux premiers mois restent sans engagement possible ; l'engagement annuel est proposé au 45e jour et commence au 3e mois, comme dans l'ADR 0023.
3. **Limites appliquées côté serveur.**
   - Places : invitation, changement de rôle, réactivation et acceptation d'invitation refusés au-delà des places de l'offre (`vet_limit`, `plan_assistant_limit`). Un changement d'offre trop petite pour l'équipe est refusé.
   - Suivis : au-delà des suivis inclus, chaque lancement ou réactivation est facturé comme avant (2,50 € et 1,26 €) ; au plafond, plus aucun lancement (`plan_quota_reached`).
   - Stive : la permission `stive.use` est retirée des offres qui ne le comprennent pas.
   - dr.veto : connexion refusée hors Premium (`plan_feature_missing`) ; passer à une offre sans intégrations demande d'abord de déconnecter dr.veto (`plan_integration_connected`). Le registre des animaux (ADR 0030) permet de suivre ses patients sans logiciel connecté.
4. **Cabinets existants.** Solo devient Starter, Solo Pro devient Pro, Clinique et Clinique Pro deviennent Premium. Un cabinet sans abonnement enregistré garde les limites de Premium.

## Conséquences

- Les prix annuels (environ 15 % de remise) et les quotas sont des choix par défaut, à confirmer par Aaron ; ils se changent dans le catalogue seul.
- Les prix sont simulés tant que Stripe n'est pas branché : les produits Stripe devront reprendre ces trois offres (lot 24).
