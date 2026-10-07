# 0008 — Équipe et droits : permissions fines en base, accès aux dossiers, invitations

- Statut : accepté (7 octobre 2026)

## Contexte

Cahier des charges §1 et §11, architecture §6 et §8 : un cabinet compte au plus 3 vétérinaires et autant d'assistants que nécessaire ; les droits sont des permissions précises décidées par l'administrateur, pas un simple libellé de rôle ; un dossier n'est visible que par son responsable, les confrères à qui il est partagé et les personnes autorisées à voir tous les suivis ; un dossier peut être privé ; toute consultation et tout changement de droit sont journalisés ; un départ ne doit laisser aucun suivi orphelin.

## Décision

1. **Catalogue fermé de 15 permissions** (table `permissions`), avec pour chaque rôle les permissions données par défaut et celles que l'administrateur peut ouvrir (`role_permissions`). Les permissions effectives de chaque membre sont dans `membership_permissions`. Le code en garde un miroir typé ; un test vérifie qu'il concorde exactement avec la base, et la matrice publiée (`docs/securite/permissions.md`) est générée depuis ce miroir (`pnpm docs:permissions`, un test échoue si elle n'est plus à jour).
2. **La base fait foi** : un déclencheur refuse toute permission non autorisée pour le rôle ; un autre applique les valeurs par défaut à la création d'un membre et à chaque changement de rôle ; un troisième garantit qu'un cabinet garde toujours un vétérinaire administrateur actif. RLS forcée sur les nouvelles tables, comme partout.
3. **Garde serveur unique** (`src/server/authz`) : personne authentifiée → membre actif du cabinet → permissions relues en base à chaque requête (un droit retiré s'applique immédiatement) → règle du dossier dans le domaine → audit. Sans la permission, un écran ou une action répond 404, comme une ressource inexistante ou d'un autre cabinet. Le menu n'affiche que les écrans autorisés, mais ce n'est qu'un confort : le serveur refuse de toute façon.
4. **Accès à un dossier** (`followupAccess`) : `none` (404), `summary` (animal, propriétaire, état, responsable, contrôle) ou `clinical` (en plus : intervention, priorité, conversation, photos, vocaux, synthèses). La vue est construite champ par champ selon ce niveau, jamais par copie de la ligne, pour qu'un champ clinique ajouté plus tard ne fuie pas. Un dossier privé n'est visible que de son responsable et des confrères à qui il est partagé, même pour qui voit tous les suivis. Chaque ouverture autorisée écrit `followup.viewed` dans la même transaction.
5. **Partage** : seul le vétérinaire responsable partage son dossier, uniquement avec un vétérinaire actif, jusqu'à retrait ou pour 7 ou 30 jours ; il peut aussi rendre le dossier privé. Un partage retiré est marqué (`revoked_at`), pas effacé, pour garder l'historique.
6. **Invitations** : lien envoyé par e-mail, valable 7 jours, à usage unique (empreinte SHA-256 du jeton en base, page sans `Referer`). Une seule invitation en attente par adresse. La limite de 3 vétérinaires compte les invitations en attente et est revérifiée à l'acceptation. L'acceptation crée le compte et l'appartenance dans une seule transaction ; la personne se connecte ensuite normalement (code e-mail pour un vétérinaire).
7. **Une adresse, un cabinet** pour l'instant : une invitation vers une adresse qui a déjà un compte est refusée avec un message clair. Le choix du cabinet pour une personne membre de plusieurs cabinets sera traité quand le besoin sera confirmé.
8. **Départ d'un membre** : l'administrateur choisit le vétérinaire qui reprend ses suivis en cours (obligatoire s'il en a), ses partages sont retirés, chaque réattribution est journalisée, et sa session tombe à la requête suivante. Personne ne peut retirer ni modifier son propre accès.
9. **Journal d'activité** (permission `activity_log.read`) : actions et connexions, sans aucun contenu clinique, ni e-mail, ni IP en clair.

## Conséquences

- Les tests d'intégration couvrent la concordance du catalogue, les déclencheurs, chaque règle d'accès (y compris dossiers privés, partages expirés ou retirés, autre cabinet) et les parcours d'équipe ; les tests de bout en bout couvrent l'assistant sans données cliniques, le partage entre vétérinaires et l'invitation jusqu'au retrait d'accès.
- Le tableau de bord de référence n'affiche plus que les suivis que la base autorise, et seulement avec l'accès clinique ; un assistant y voit une vue d'organisation.
- Les écrans prévus mais pas encore construits (agenda, Stive, protocoles, réglages, facturation) restent derrière leur permission et répondent « pas encore disponible ».
