# 0009 — Protocoles : versions immuables, validation par un vétérinaire, bibliothèque fictive

- Statut : accepté (7 octobre 2026)

## Contexte

Cahier des charges §5, §7 et §9 : une bibliothèque de protocoles prête à l'emploi dès l'installation ; un vétérinaire crée, duplique et modifie ses propres protocoles ; modifier un protocole n'altère jamais les suivis déjà lancés ; le vétérinaire valide les signes d'alerte de chaque protocole ; Numa ne prend aucune décision médicale. Architecture §6 : tables `protocols`, `protocol_versions`, `protocol_steps`, `alert_rules`.

## Décision

1. **Un protocole est une suite de versions.** `protocols` ne porte que l'identité (cabinet, propriétaire, origine), la version courante et l'archivage. Le contenu (nom, type, espèce, durée, description, étapes, signes d'alerte) vit dans `protocol_versions`, `protocol_steps` et `alert_rules`.
2. **Immuabilité contrôlée par la base** : le rôle applicatif ne peut qu'ajouter des versions, étapes et signes d'alerte ; des déclencheurs refusent toute modification ou suppression, même au propriétaire des tables. Seule exception : la validation d'une version, posée une seule fois. L'identité d'un protocole ne change pas.
3. **Un suivi garde sa version** : `followups.protocol_version_id` ; un déclencheur refuse de changer la version d'un suivi lancé. Le dossier affiche la version utilisée, consultable dans l'historique.
4. **Validation** : seul un vétérinaire (rôle vétérinaire et droit de modifier ce protocole) valide une version. Une version écrite par un vétérinaire dans l'éditeur est validée par lui à l'enregistrement ; un modèle ajouté depuis la bibliothèque et une copie restent « à valider par un vétérinaire » jusqu'à validation explicite. Le lancement de suivis (phase suivante) refusera un protocole non validé.
5. **Protocoles du cabinet et protocoles personnels** : nouvelle permission `protocols.create_own` (par défaut pour les vétérinaires) pour créer, dupliquer et modifier ses propres protocoles ; ceux du cabinet restent sous `protocols.manage`. Un protocole personnel est visible de son auteur et des personnes qui gèrent les protocoles du cabinet (sans pouvoir le modifier). Les protocoles du cabinet sont lisibles par qui gère, crée des protocoles ou lance des suivis. Un protocole illisible répond 404.
6. **Bibliothèque de départ** dans le code (`src/domains/protocoles/library.ts`) : contenu **fictif**, marqué « à valider par un vétérinaire », sans posologie ni diagnostic (test dédié). Un modèle s'ajoute une fois par cabinet (`library_key` unique). L'installation guidée (lot 7) proposera de les ajouter en une fois.
7. **Archivage plutôt que suppression** : un protocole archivé ne se modifie plus, se restaure, et ses versions restent consultables pour les suivis qui les utilisent.
8. **Audit** : création, nouvelle version, copie, ajout depuis la bibliothèque, validation, archivage et restauration.

## Conséquences

- Les tests d'intégration prouvent qu'une modification crée la version 2 sans toucher le suivi lancé avec la version 1, et que la base refuse toute réécriture de contenu. Les tests de bout en bout couvrent ajout, validation, modification, historique, copie et création.
- Le contenu de la bibliothèque devra être rédigé et validé par un vétérinaire avant tout usage réel.
