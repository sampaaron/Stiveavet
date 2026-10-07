# 0004 — Connecteurs externes simulés jusqu'à décision explicite

- Statut : accepté (7 octobre 2026)

## Décision

WhatsApp, dr.veto, Stripe, la passerelle IA et l'e-mail transactionnel sont chacun derrière une interface (`src/adapters/<nom>`). Jusqu'à décision explicite d'Aaron, seules des implémentations simulées existent : aucun appel réseau, aucune clé, aucun compte externe.

## Conséquences

- Les tests et les écrans fonctionnent avec des données fictives uniquement.
- Brancher un vrai prestataire revient à ajouter une implémentation de l'interface, sans toucher aux domaines.
