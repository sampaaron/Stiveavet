# 0023 — Engagement annuel proposé à 45 jours d'essai

- Statut : accepté (8 octobre 2026)

## Contexte

Phase 3, lot 20. Le cahier des charges §13 interdit tout engagement annuel automatique pendant les six premiers mois et demande un choix explicite avant le 7e mois. Le plan de la phase 1 (ADR 0011) proposait l'engagement à partir du 3e mois, sur demande du cabinet. Le 8 octobre 2026, Aaron a décidé : « on va proposer des abonnements annuels plus à partir du 7e mois mais au premier mois et demi pour le prochain prélèvement ».

## Décision

1. **Offre à 45 jours d'essai** (`ANNUAL_OFFER_DAYS`). À partir de là, qui gère la facturation peut choisir l'engagement annuel, à tout moment, tant que le cabinet est au mois.
2. **Début de l'engagement** : à la prochaine échéance, et jamais avant la fin de l'essai. Choisi pendant l'essai, il commence au prélèvement du 3e mois. Les 12 mois finissent donc au plus tôt 14 mois après le début de l'abonnement. La base le revérifie (migration 0016) : pas de choix avant le 45e jour, pas de fin d'engagement avant 14 mois.
3. **Choix toujours explicite** : sans réponse, le cabinet reste au mois, au tarif sans engagement. Le choix est demandé dès l'offre, puis redemandé une fois au début du 6e mois si le cabinet était resté au mois. Après le 7e mois, l'engagement reste possible sur demande, sans rappel.
4. **Où le choix est demandé** :
   - sur la page Facturation ;
   - par un bandeau sur tout l'espace cabinet, pour qui gère la facturation ;
   - par un e-mail à ces mêmes personnes, au 45e jour puis au début du 6e mois.
5. **E-mails envoyés par le worker** : deux tâches `billing.annual_offer` sont inscrites à la création de l'abonnement. À son heure, chaque tâche revérifie que le choix reste à faire, puis écrit au journal sans contenu.
   - L'e-mail est en français, comme les autres e-mails de l'équipe (ADR 0022).
   - Il ne contient aucune donnée clinique.
   - Le worker a son propre expéditeur (`src/adapters/email/worker.ts`), limité à Mailpit comme l'application (ADR 0004).

## Conséquences

- Tests unitaires : ouverture de l'offre, début de l'engagement, rappels.
- Tests d'intégration :
  - les deux tâches inscrites ;
  - destinataires limités à qui gère la facturation ;
  - rien n'est envoyé une fois le choix fait ou l'abonnement résilié ;
  - refus en base (23514) ;
  - échec d'envoi réessayé.
- Parcours de bout en bout : le bandeau disparaît une fois le choix fait.
- Les abonnements créés avant ce lot (cabinets fictifs) n'ont pas ces tâches. Aucun cabinet réel n'existe encore.
- Si un envoi échoue pour un second destinataire, la tâche est réessayée, et le premier peut recevoir l'e-mail deux fois. C'est accepté pour un e-mail commercial sans effet, à revoir si la liste des destinataires grandit.
- Au lot 24 (Stripe), la date de début de l'engagement deviendra celle de l'abonnement Stripe.
