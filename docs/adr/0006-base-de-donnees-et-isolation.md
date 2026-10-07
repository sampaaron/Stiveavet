# 0006 — Base de données : migrations SQL réversibles, deux rôles et RLS forcée

- Statut : accepté (7 octobre 2026)

## Contexte

L'architecture impose PostgreSQL et une isolation stricte entre cabinets. Une erreur de filtre dans le code applicatif ne doit jamais suffire à exposer les données d'un autre cabinet.

## Décision

1. **Migrations SQL écrites à la main**, versionnées dans `db/migrations/NNNN_nom.up.sql` et `.down.sql`. Le registre `public.schema_migrations` garde l'empreinte SHA-256 de chaque fichier : une migration déjà appliquée puis modifiée bloque le déploiement. Chaque migration s'exécute dans sa transaction. Drizzle ORM ne sert que de miroir typé pour les requêtes ; un test d'intégration vérifie que ce miroir correspond colonne par colonne à la base réelle.
2. **Deux rôles PostgreSQL**. `stivea_migrator` possède le schéma et n'est jamais utilisé par l'application. `stivea_app` n'est ni propriétaire, ni superutilisateur, ni `BYPASSRLS` ; il n'a que les droits nécessaires table par table et aucun droit de créer des objets. Le superutilisateur ne sert qu'à créer ces rôles (`db/bootstrap/roles.sql`, local et CI ; en production, console de l'hébergeur et gestionnaire de secrets).
3. **RLS activée et forcée sur toutes les tables.** Chaque requête applicative passe par `withTenant()`, qui fixe `app.organization_id` (et `app.user_id`) avec `set_config(..., true)`, donc pour la seule transaction en cours. Sans cabinet fixé, aucune ligne n'est visible ni insérable.
4. **Clés étrangères composites** `(organization_id, id)` : un suivi ne peut pas référencer l'animal d'un autre cabinet, même si la RLS était contournée.
5. **Journal d'audit en ajout seul** : le rôle applicatif n'a que `SELECT` et `INSERT`, et un déclencheur refuse toute modification, même au propriétaire.
6. Les tables des domaines suivants (sessions, protocoles, facturation…) arrivent avec leur lot, sous les mêmes règles.

## Conséquences

- Les tests d'intégration (`pnpm test:integration`) créent une base neuve par exécution, y appliquent les migrations et le jeu fictif, puis vérifient table par table l'isolation, les privilèges et l'aller-retour des migrations. Ils tournent en CI contre PostgreSQL 16.
- Le jeu fictif s'installe avec le rôle applicatif, donc sous RLS, et refuse tout environnement autre que `APP_ENV=local`.
