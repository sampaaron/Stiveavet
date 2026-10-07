# 0011 — Facturation : faits enregistrés, règles pures, prélèvements simulés

- Statut : accepté (7 octobre 2026)

## Contexte

Cahier des charges §13 : prix HT par cabinet, prélèvement mensuel ; essai pilote à 86 € HT par mois pendant 2 mois ; formules Solo, Solo Pro, Clinique, Clinique Pro (1 ou 3 vétérinaires) ; 10 suivis actifs inclus, 2,50 € HT par lancement et 1,26 € HT par réactivation au-delà, prélevés avec l'abonnement suivant ; aucun engagement annuel automatique sur les six premiers mois ; impayé : 30 jours pour régulariser avant le blocage des nouveaux suivis ; les suivis en cours continuent toujours ; lecture seule 3 mois après la fin du dernier suivi. Réponse d'Aaron (2026-10-07) : pendant les mois 3 à 6, passage à l'annuel possible plus tôt sur demande du cabinet. Architecture §6 : `subscriptions`, `invoices`, `usage_events`, `payment_events`. Stripe est prévu mais interdit en phase 1 (ADR 0004).

## Décision

1. **Des faits, pas un statut** : `subscriptions` enregistre la formule, le cycle, le début, le choix explicite du cycle, la fin d'engagement, le premier impayé et la résiliation. Essai, période souple, impayé, blocage, lecture seule et fin d'accès se **déduisent** de ces faits dans `src/domains/facturation/rules.ts`, sans base ni horloge, couvert à 100 % (seuil vérifié par `pnpm test`).
2. **Montants en centimes HT**, TVA à 20 % sur la facture (taux normal français, à confirmer par l'expert-comptable avant toute facturation réelle).
3. **Formule choisie à l'inscription** (Clinique proposée par défaut), appliquée après l'essai. La limite de vétérinaires (1 ou 3) s'applique aux invitations, réactivations et changements de rôle ; une formule plus petite que l'équipe est refusée.
4. **Engagement annuel** : uniquement sur demande, à partir du mois 3 (refusé aussi par la base pendant l'essai), pour 12 mois à partir de l'échéance suivante. Pendant les mois 3 à 6, un rappel propose de choisir ; « rester au mois » est un choix enregistré. Sans réponse, rien ne bascule.
5. **Résiliation** à tout moment, effective à la fin du mois d'abonnement en cours, ou à la fin de l'engagement annuel. Aucune échéance n'est émise après.
6. **Usage** : `recordUsage` s'exécute dans la transaction qui lance ou réactive un suivi (phase 2) ; il refuse si les nouveaux suivis sont bloqués et calcule le supplément d'après les suivis actifs (`active`, `paused`, `human_takeover`, hors suivis test). Une clé d'idempotence unique empêche de compter deux fois un même lancement.
7. **Factures** : une par mois d'abonnement (`UNIQUE (organization_id, subscription_month)`), immuables sauf leur statut ; un usage n'est rattaché qu'à une facture ; les paiements sont en ajout seul. En phase 1, les échéances sont rattrapées à la première requête qui suit (sous verrou de l'abonnement, idempotent) ; une tâche planifiée le fera avec le vrai prestataire. Les factures attendent la signature du mandat avant d'être prélevées.
8. **Prestataire simulé** (`src/adapters/billing-provider/fake.ts`) : aucun appel réseau ni donnée bancaire ; références `sim_…`. La régularisation relance les prélèvements refusés.
9. **Lecture seule appliquée par la garde serveur** : `memberContext()` calcule l'accès du cabinet et ne garde que les droits de consultation (lecture seule) ou la seule facturation (accès terminé). Les droits en base ne changent pas : ils reviennent dès la régularisation. Un bandeau signale l'impayé à qui gère la facturation, et la suspension ou la lecture seule à toute l'équipe.
10. **Audit** : émission, paiement, échec, changement de formule, choix du cycle, résiliation, régularisation.

## Conséquences

- Le passage à Stripe (mode test puis réel) remplacera l'adaptateur et la tâche d'émission, avec webhooks idempotents ; il demande un compte et des clés décidés par Aaron.
- L'envoi des factures par e-mail et l'export PDF de l'historique sont à brancher avec le vrai prestataire et le fournisseur d'e-mail.
- Les offres « plus de 3 vétérinaires » restent sur demande, hors parcours en libre-service.
