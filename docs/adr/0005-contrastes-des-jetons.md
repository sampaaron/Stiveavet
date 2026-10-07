# 0005 — Deux couleurs de la référence visuelle assombries pour le contraste

- Statut : accepté (7 octobre 2026)

## Décision

| Jeton                        | Référence visuelle | Retenu    | Raison                                                                                                                     |
| ---------------------------- | ------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| Texte secondaire `ink-muted` | `#64748b`          | `#5b6779` | 4,19:1 sur fond discret et 3,86:1 sur fond d'alerte, sous le seuil WCAG AA de 4,5:1 ; le nouveau ton dépasse 4,6:1 partout |
| Ambre `watch`                | `#9a6424`          | `#87561d` | 4,33:1 sur son propre fond clair ; le nouveau ton atteint 5,4:1                                                            |

## Raisons

La référence visuelle exige elle-même un contraste suffisant, notamment pour les badges. La teinte reste identique à l'œil ; seule la luminosité baisse. Le test axe du catalogue de composants bloque toute régression.
