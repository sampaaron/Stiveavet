# Sécurité

Ce dossier accueille le modèle de menaces et la matrice des permissions (lot 5). Règles déjà actives depuis le lot 0 :

- CSP stricte avec nonce par requête, sans domaine tiers (ADR 0003).
- En-têtes : HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` restrictive, COOP/CORP.
- Variables d'environnement validées au démarrage ; une erreur ne cite que le nom de la variable, jamais sa valeur.
- Aucun secret versionné (`.env` ignoré, détection gitleaks en CI) ; audit des dépendances de production bloquant.
- Image Docker sans root, système de fichiers en lecture seule, capacités Linux retirées.
- Base de données (ADR 0006) : l'application se connecte avec un rôle sans privilège de propriétaire ni `BYPASSRLS` ; RLS forcée sur chaque table, cabinet fixé par transaction ; clés étrangères composites entre cabinets ; journal d'audit en ajout seul.
