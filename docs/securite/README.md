# Sécurité

Ce dossier accueille le modèle de menaces et la [matrice des permissions](permissions.md), générée depuis le code. Règles déjà actives depuis le lot 0 :

- CSP stricte avec nonce par requête, sans domaine tiers (ADR 0003).
- En-têtes : HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` restrictive, COOP/CORP.
- Variables d'environnement validées au démarrage ; une erreur ne cite que le nom de la variable, jamais sa valeur.
- Aucun secret versionné (`.env` ignoré, détection gitleaks en CI) ; audit des dépendances de production bloquant.
- Image Docker sans root, système de fichiers en lecture seule, capacités Linux retirées.
- Base de données (ADR 0006) : l'application se connecte avec un rôle sans privilège de propriétaire ni `BYPASSRLS` ; RLS forcée sur chaque table, cabinet fixé par transaction ; clés étrangères composites entre cabinets ; journal d'audit en ajout seul.
- Authentification (ADR 0007) : Argon2id, schéma `auth` inaccessible au rôle applicatif, sessions en base, code e-mail des vétérinaires sur nouvel appareil, verrouillage serveur à 40 min, réinitialisation à usage unique, limitation des tentatives, journal de connexion sans donnée en clair.
- Équipe et droits (ADR 0008) : permissions fines contrôlées par la base, relues à chaque requête ; dossier invisible (404) sans responsabilité, partage ou permission ; dossiers privés ; vue « organisation seulement » sans donnée clinique ; invitations à usage unique ; chaque consultation et chaque changement de droit journalisés.
- Protocoles (ADR 0009) : versions immuables contrôlées par la base, version figée pour chaque suivi lancé, validation par un vétérinaire, protocoles personnels invisibles des confrères.
