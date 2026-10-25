# 0031 — Offres Starter, Pro et Premium

- Statut : accepté (14 octobre 2026), remplace les formules de l'ADR 0011 et le prix d'essai de l'ADR 0023
- Migration : `0022_offres_starter_pro_premium`

## Contexte

Le cahier des charges du MVP fixe trois offres : Starter à 79 €, Pro à 129 € (offre phare) et Premium à 199 € HT par mois, avec des quotas réglables, les équipes et les intégrations avancées réservées à Premium, et des dépassements maîtrisés. Les quatre formules précédentes (Solo, Solo Pro, Clinique, Clinique Pro) et l'essai pilote à 86 € ne correspondent plus.

## Décision

1. **Catalogue unique.** `PLAN_CATALOG` (`facturation/rules.ts`) porte tout : prix mensuel, prix avec engagement annuel, places de vétérinaires et d'assistants, suivis actifs inclus, plafond des suivis actifs, Stive, intégrations avancées. L'inscription, la facturation, le site public et les e-mails lisent ce catalogue ; aucun prix n'est écrit ailleurs.

   | Offre   | Mois  | Annuel | Vétérinaires | Assistants  | Suivis inclus / plafond | Stive | dr.veto |
   | ------- | ----- | ------ | ------------ | ----------- | ----------------------- | ----- | ------- |
   | Starter | 119 € | 99 €   | 1            | 1           | 15 / 30                 | non   | non     |
   | Pro     | 189 € | 159 €  | 2            | 3           | 40 / 80                 | oui   | non     |
   | Premium | 289 € | 245 €  | 3            | sans limite | 100 / 200               | oui   | oui     |

   Prix révisés le 20 octobre 2026 (auparavant 79 / 129 / 199 € et 67 / 109 / 169 €). Aaron a délégué le choix : s'aligner sur la concurrence, un peu en dessous, tout en assurant une bonne marge. Repères relevés le même jour, par cabinet et par mois, chiffres publiés par des comparatifs et à confirmer auprès des éditeurs : plateformes de communication client vétérinaires aux États-Unis de 149 à 525 $ (PetDesk, Weave, Vello, Otto, AllyDVM), PetsApp au Royaume-Uni autour de 99 £ pour 10 ETP. Stivea Vet se place un peu en dessous de ces offres, alors qu'il comprend le suivi par une assistante IA sur WhatsApp. L'engagement annuel garde une remise d'environ 15 %.

2. **Fin de l'essai pilote.** Le prix de l'offre s'applique dès le premier mois. Les deux premiers mois restent sans engagement possible ; l'engagement annuel est proposé au 45e jour et commence au 3e mois, comme dans l'ADR 0023.
3. **Limites appliquées côté serveur.**
   - Places : invitation, changement de rôle, réactivation et acceptation d'invitation refusés au-delà des places de l'offre (`vet_limit`, `plan_assistant_limit`). Un changement d'offre trop petite pour l'équipe est refusé.
   - Suivis : au-delà des suivis inclus, chaque lancement ou réactivation est facturé comme avant (2,50 € et 1,26 €) ; au plafond, plus aucun lancement (`plan_quota_reached`).
   - Stive : la permission `stive.use` est retirée des offres qui ne le comprennent pas.
   - dr.veto : connexion refusée hors Premium (`plan_feature_missing`) ; passer à une offre sans intégrations demande d'abord de déconnecter dr.veto (`plan_integration_connected`). Le registre des animaux (ADR 0030) permet de suivre ses patients sans logiciel connecté.
4. **Cabinets existants.** Solo devient Starter, Solo Pro devient Pro, Clinique et Clinique Pro deviennent Premium. Un cabinet sans abonnement enregistré garde les limites de Premium.
5. **Offre de lancement (décidée le 20 octobre 2026).** −25 % environ, arrondis dans le catalogue, pendant les 6 premiers mois d'abonnement, pour tout cabinet dont l'abonnement démarre entre le 20 octobre et le 31 décembre 2026 inclus (heure de Paris).

   | Offre   | Mois  | Annuel |
   | ------- | ----- | ------ |
   | Starter | 89 €  | 74 €   |
   | Pro     | 142 € | 119 €  |
   | Premium | 217 € | 184 €  |
   - Le droit à l'offre se déduit de la date de début d'abonnement (`hasLaunchOffer`) : aucune colonne en base, et un cabinet inscrit pendant l'offre la garde même après sa clôture.
   - Le prix dépend du mois d'abonnement, jamais du jour : il ne change pas en cours de mois. Au 7e mois, le prix normal s'applique, avec ou sans engagement.
   - Pendant l'offre, le site affiche le prix de lancement, le prix normal barré et les conditions ; le bandeau d'annonce la présente. L'inscription montre les prix de lancement. Les factures portent la mention « offre de lancement −25 % ». L'e-mail d'engagement annuel rappelle les prix de lancement.
   - La période et les montants se changent dans `LAUNCH_OFFER` et le catalogue seuls. Aaron n'a pas fixé qui en profite ni combien de temps : la période (jusqu'au 31 décembre) et la durée (6 mois) sont des choix par défaut, à confirmer.

## Conséquences

- Les prix, la remise annuelle et les quotas se changent dans le catalogue seul ; tout le reste (site, inscription, factures, e-mails) suit.
- Les prix sont simulés tant que Stripe n'est pas branché : les produits Stripe devront reprendre ces trois offres (lot 24).
