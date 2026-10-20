# 0037 — Offre de lancement à −25 %

- Statut : accepté (20 octobre 2026)
- Complète l'ADR 0031 (offres Starter, Pro et Premium)

## Contexte

Aaron a demandé une offre de lancement 25 % moins chère que la grille (89 €, 179 € et 359 € HT par mois). Il n'a pas fixé sa durée ni les cabinets concernés.

## Décision

1. **Prix.** Starter 67 €, Pro 134 €, Premium 269 € HT par mois : 25 % de remise, arrondie à l'euro. Les montants sont dans `PLAN_CATALOG` (`introMonthlyCents`) et la règle dans `INTRO_OFFER` (`facturation/rules.ts`). Un test vérifie que chaque prix de lancement suit la remise.
2. **Durée : les 6 premiers mois d'abonnement**, quel que soit le cycle. L'offre couvre les deux premiers mois et la période souple, puis s'arrête juste avant le choix du 7e mois. Un cabinet qui s'engage à l'année paie donc le prix de lancement jusqu'au 6e mois, puis le prix annuel ; le prix de lancement reste toujours sous le prix annuel.
3. **Qui en profite : les cabinets inscrits jusqu'au 30 juin 2027** (heure de Paris). La date d'inscription suffit : aucune donnée ni migration en plus, et le droit d'un cabinet ne change pas après coup.
4. **Affichage.** Tant que l'offre est ouverte, la page Tarifs l'annonce, barre le prix normal et dit le prix qui suit. L'inscription donne le prix de lancement et le prix normal. Les factures portent la mention « offre de lancement ». Le bouton « Démarrer dès 89 € » et les e-mails de démo gardent le prix normal, qui reste le vrai prix d'entrée.

## Conséquences

- Pour changer la durée, la date ou la remise, on modifie `INTRO_OFFER` ; pour un prix, `PLAN_CATALOG`.
- Les tests d'intégration et de bout en bout tiennent compte de la date : ils restent justes après la fin de l'offre.
- Les prix restent simulés tant que Stripe n'est pas branché. Le vrai Stripe devra reprendre cette remise, par exemple sous forme de coupon de 6 mois.
