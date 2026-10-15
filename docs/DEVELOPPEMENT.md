# Guide du développeur

Ce guide sert à se repérer dans le code, à suivre une requête de bout en bout et à déboguer sans
casser l'isolation entre cabinets. Les décisions et leurs raisons sont dans `docs/adr/` ; les
règles de sécurité dans `docs/securite/`.

## Carte du dépôt

| Dossier                  | Rôle                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `src/app/[lang]`         | Site public bilingue (`/fr`, `/en`).                                                                                     |
| `src/app/(auth)`         | Connexion, code de sécurité, inscription, invitation.                                                                    |
| `src/app/app`            | Espace cabinet. Chaque écran a sa page et un fichier `actions.ts` (Server Actions).                                      |
| `src/app/api`            | Routes HTTP : santé, désinscription, webhooks (WhatsApp).                                                                |
| `src/domains/<domaine>`  | Logique métier. `service.ts` est la porte d'entrée ; `schema.ts` décrit les tables ; le reste est interne au domaine.    |
| `src/adapters/<service>` | Connecteurs externes (WhatsApp, IA, e-mail, stockage, dr.veto, paiement). Chacun a une version simulée et une imitation. |
| `src/server`             | Socle transversal : configuration (`env.ts`), base (`db/`), sessions (`auth/`), droits (`authz/`), en-têtes et CSP.      |
| `src/server/services.ts` | Assemble les services (base, adaptateurs, configuration). L'interface ne crée jamais un service elle-même.               |
| `src/i18n`               | Dictionnaires. Le français fait foi ; l'anglais est typé sur le français, une clé oubliée ne compile pas.                |
| `src/ui`                 | Composants visuels partagés et formats (dates, montants).                                                                |
| `infra/scaleway`         | Infrastructure du staging en Terraform (ADR 0028). Rien n'est créé sans feu vert.                                        |
| `db/migrations`          | Migrations SQL numérotées, chacune avec son `.up.sql` et son `.down.sql`.                                                |
| `db/seed`                | Données fictives : les Tilleuls (Claire, Hugo, Inès, Léa) et le cabinet du Dr Martin.                                    |
| `scripts/`               | Worker de la file de tâches, e-mails de la démo, évaluation de l'IA, documentation des droits.                           |
| `tests/integration`      | Tests sur un vrai PostgreSQL (RLS, droits, file de tâches).                                                              |
| `tests/e2e`              | Parcours Playwright dans un navigateur, avec Mailpit pour les codes reçus par e-mail.                                    |

Les tests unitaires (`*.test.ts`) sont rangés à côté du code qu'ils testent.

## Le trajet d'une action

Exemple : un vétérinaire relance une tâche en échec (`src/app/app/taches/actions.ts`).

1. **Server Action.** Elle lit le formulaire et le valide avec Zod. Une saisie invalide renvoie
   `invalidRequest()`, un message générique sans détail du champ.
2. **`memberContext()`** (`src/server/authz`). Il relit en base la session, le membre actif et ses
   permissions. Aucune décision de droit ne repose sur un cookie ou sur le navigateur.
3. **`services.<domaine>()`** (`src/server/services.ts`). Il renvoie le service du domaine, branché
   sur la base et sur les adaptateurs configurés.
4. **Service du domaine.** Il vérifie la permission (`assertPermission`), puis ouvre une
   transaction avec `tenantRunner(db)` (`src/server/db/tenant.ts`). Celle-ci fixe
   `app.organization_id` et `app.user_id`, et les politiques RLS de PostgreSQL ne laissent voir
   que les lignes de ce cabinet.
5. **Dans la transaction,** le service fait le changement métier et l'inscrit au journal
   (`src/domains/audit/journal.ts`). S'il le faut, il ajoute une tâche avec `enqueue`, ou un
   événement avec `emit`. Tout est validé ensemble ou annulé ensemble.
6. **Retour.** Un refus métier lève une `DomainError` (`src/domains/equipe/actor.ts`), que
   `attempt()` ou `domainFailure()` traduit dans la langue de la personne. Toute autre erreur
   remonte vers la page d'erreur générique, sans détail.

Règle à retenir : on n'accède jamais aux données d'un cabinet en dehors de `withTenant` ou
`tenantRunner`. Le rôle applicatif `stivea_app` est soumis à la RLS forcée. Sans contexte de
cabinet, une requête ne voit rien : elle n'échoue pas, elle renvoie zéro ligne.

## File de tâches

Les tâches de fond (envois WhatsApp, IA, rappels, conservation, offre annuelle) passent par la
file de PostgreSQL (ADR 0014). Le code est dans `src/domains/taches/`.

- **`enqueue` / `emit`** (`queue.ts`) s'appellent dans la transaction du changement métier. Une
  clé d'idempotence empêche les doublons, même en cas de double clic ou de webhook rejoué.
- **Le worker** (`worker.ts`, lancé par `pnpm worker`) prend les tâches dues. Il exécute chacune
  dans la transaction de son cabinet et la marque réussie dans cette même transaction.
- **Un échec voulu** se signale avec `throw new JobError(code)`. Avec `{ final: true }`, la tâche
  passe tout de suite en échec, sans nouvelle tentative. Attention : lever une erreur annule
  toute la transaction de la tâche. Ce qui doit survivre à l'échec, comme prévenir le
  vétérinaire, va dans le `deadHandlers` du type (`registry.ts`).
- **Les codes d'erreur** sont courts et techniques (`kinds.ts`). On n'enregistre jamais le
  message brut d'une exception.
- **Les tâches en échec** se relancent ou s'annulent depuis « Tâches en échec », dans l'espace
  cabinet.

Pour observer la file en local, lancez `pnpm worker --once` : il fait un seul passage et
n'affiche que des compteurs.

## Base de données et migrations

- **Trois rôles.**
  - Le superutilisateur ne sert qu'à créer les rôles et les bases de test.
  - `stivea_migrator` possède le schéma et applique les migrations.
  - `stivea_app` est le rôle de l'application, soumis à la RLS.
- **Ajouter une migration.** Créez `db/migrations/00NN_nom.up.sql` et `.down.sql`, puis lancez
  `pnpm db:migrate`. Pour annuler la dernière migration : `pnpm db:migrate down`. Le test
  `tests/integration/migrations.test.ts` vérifie que chaque migration a son inverse et que
  toutes s'annulent puis se réappliquent sans erreur.
- **Toute nouvelle table** active `ENABLE` et `FORCE ROW LEVEL SECURITY`, avec une politique
  filtrée sur `app.current_organization_id()`. Le test
  `tests/integration/privileges.test.ts` échoue si une table l'oublie.
- **Le schéma Drizzle** (`src/domains/*/schema.ts`, regroupé par `src/server/db/schema.ts`)
  décrit les tables pour TypeScript. Il ne crée rien : le SQL des migrations fait foi, et
  `migrations.test.ts` vérifie que les deux correspondent colonne par colonne.

### Pièges connus

- **Une migration `down` qui modifie des données sous FORCE RLS ne fait rien, sans erreur.** Il
  faut encadrer la modification par `ALTER TABLE … NO FORCE ROW LEVEL SECURITY` puis `FORCE`.
  La migration `0018_medias_whatsapp.down.sql` en donne un exemple.
- **Retirer une valeur d'un `enum`** oblige à recréer le type. Il faut d'abord supprimer, puis
  recréer, les contraintes `CHECK` qui la citent.
- **Une fonction SQL ne peut pas utiliser une valeur d'enum ajoutée dans la même transaction.**
  Comparez alors en texte (`::text`).
- **Les webhooks** arrivent sans cabinet connu. Ils passent par des fonctions
  `SECURITY DEFINER` étroites, qui retrouvent le cabinet à partir d'un identifiant du
  fournisseur, puis tout le reste se fait sous `withTenant`.

## Heure de Paris

Les règles métier (rappels, jour courant, horaires de garde) suivent l'heure murale de Paris.
Les aides sont `parisWallMinutes` et `parisLocalToDate` dans `src/domains/reglages/content.ts`,
et `minutesOfDay` dans `src/domains/commun.ts`. N'utilisez jamais `new Date().getHours()` : le
serveur tourne en UTC. Les tests e2e attendent le jour suivant quand minuit approche à Paris
(`tests/e2e/prepare-database.mts`).

## Journaux, erreurs et données sensibles

- Les journaux du serveur et du worker ne contiennent que des identifiants, des types et des
  codes. Jamais de texte de message, de contenu clinique, de numéro, d'e-mail, de jeton ou de
  mot de passe.
- Le journal d'audit (`recordAudit` et ses variantes) ne reçoit que des métadonnées techniques.
  La base y interdit la modification et la suppression.
- Pour déboguer, ajoutez un `console.warn` temporaire avec des identifiants seulement, et
  retirez-le avant de pousser. `pnpm lint` refuse `console.log`.

## Déboguer en local

| Symptôme                                          | Piste                                                                                                             |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Une liste est vide alors que la base a des lignes | La requête est faite hors `withTenant`, ou sur un autre cabinet. Vérifiez l'`organizationId` passé.               |
| « Requête invalide » après un envoi de formulaire | La validation Zod de l'action a refusé la saisie. Comparez les champs du formulaire au schéma de l'action.        |
| Une tâche reste « à faire »                       | Le worker ne tourne pas (`pnpm worker`), ou ce type de tâche n'a pas d'exécutant dans `registry.ts`.              |
| Une tâche est en échec                            | Son code est affiché dans « Tâches en échec ». Le code se trouve dans `kinds.ts`, l'exécutant dans `registry.ts`. |
| Le code de connexion n'arrive pas                 | Il est dans Mailpit : http://localhost:8025.                                                                      |
| Un test e2e échoue sur « aujourd'hui »            | La course a franchi minuit à Paris. Relancez le test.                                                             |
| La page est blanche, avec une erreur CSP          | Un script ou un style en ligne n'a pas le nonce de la requête (ADR 0003, `src/server/security/csp.ts`).           |
| Erreur de configuration au démarrage              | `src/server/env.ts` liste la variable fautive, sans sa valeur. Comparez votre `.env` avec `.env.example`.         |

Pour lire la base directement, connectez-vous avec le rôle migrateur. Le rôle applicatif ne voit
rien sans contexte de cabinet ; pour lui en donner un dans `psql` :

```sql
BEGIN;
SELECT set_config('app.organization_id', '<uuid du cabinet>', true);
SELECT * FROM followups;
ROLLBACK;
```

## Commandes

```bash
pnpm check                 # lint, format, types, tests unitaires
pnpm build                 # build de production
pnpm test:integration      # vrai PostgreSQL ; TEST_DATABASE_ADMIN_URL requis
pnpm test:e2e              # Playwright ; PostgreSQL et Mailpit lancés
pnpm docs:permissions      # régénère docs/securite/permissions.md depuis la matrice des droits
```

Avant de pousser : `pnpm check`, `pnpm build` et `pnpm test:e2e`. La CI rejoue aussi les tests
d'intégration et Gitleaks sur chaque commit. Une clé factice écrite en clair dans un test
fait échouer Gitleaks : tirez-la au hasard (`randomBytes`).

## Ajouter une fonctionnalité

1. **Une décision qui engage l'architecture** va d'abord dans un ADR (`docs/adr/NNNN-titre.md`).
2. **La migration** crée les tables, la RLS forcée et les politiques. Le schéma Drizzle suit.
3. **Le service du domaine** : entrées validées par Zod, permission vérifiée,
   `tenantRunner(db)`, journal d'audit.
4. **Dans `src/server/services.ts`**, on branche le service s'il est nouveau.
5. **L'action et la page** dans `src/app/app/...`, avec les textes dans les deux dictionnaires.
6. **Les tests** : unitaires pour les règles, intégration pour les droits et l'isolation, e2e
   pour le parcours.
