# Stivea Vet

Logiciel de suivi post-consultation pour cabinets vétérinaires. Cette version ne contient que des données fictives et des connecteurs simulés.

## Démarrer

Prérequis : Node 22, pnpm 10, Docker.

```bash
pnpm install
pnpm dev                 # http://localhost:3000
```

Pile complète (application, PostgreSQL, Mailpit) :

```bash
cp .env.example .env     # puis renseigner les trois mots de passe locaux et les URL associées
docker compose -f docker/compose.yaml --env-file .env up --build
pnpm db:migrate          # schéma, avec le rôle stivea_migrator
pnpm db:seed             # deux cabinets fictifs, avec le rôle applicatif (sous RLS)
```

Mailpit (e-mails capturés, dont les codes de sécurité) : http://localhost:8025.

Comptes fictifs créés par `pnpm db:seed`, tous avec la phrase de passe `tilleuls fictifs en local` :

| Compte                                                    | Rôle                        | Cabinet               |
| --------------------------------------------------------- | --------------------------- | --------------------- |
| `claire.fontaine@tilleuls.test`                           | vétérinaire administratrice | Clinique des Tilleuls |
| `hugo.marchal@tilleuls.test`, `ines.benali@tilleuls.test` | vétérinaires                | Clinique des Tilleuls |
| `lea.roux@tilleuls.test`                                  | assistante (pas de code)    | Clinique des Tilleuls |
| `paul.martin@cabinet-martin.test`                         | vétérinaire administrateur  | Cabinet du Dr Martin  |

Les vétérinaires reçoivent un code dans Mailpit à la première connexion depuis un navigateur. Les invitations envoyées depuis « Équipe et droits » arrivent aussi dans Mailpit.

Droits par défaut : Claire voit tout et gère l'équipe ; Hugo et Inès ne voient que leurs suivis et ceux qu'on leur partage ; Léa voit l'organisation des suivis sans aucune donnée clinique. Détail : `docs/securite/permissions.md`.

Protocoles : la bibliothèque de départ (contenu fictif, à valider par un vétérinaire) est installée aux Tilleuls ; la castration du chien y reste « à valider », et Hugo a un protocole personnel.

Installation : les Tilleuls ont terminé sept étapes sur huit (connexions simulées, réglages de départ, deux contacts d'urgence, garde de Hugo puis d'Inès) ; le suivi test reste à créer depuis `/app/demarrage`. Un cabinet créé par inscription part de zéro.

Facturation (simulée) : les Tilleuls sont en formule Clinique au 5e mois, choix de l'engagement annuel à faire ; le cabinet du Dr Martin est en formule Solo, avec un prélèvement refusé il y a 12 jours (`paul.martin@cabinet-martin.test`, à régulariser depuis Facturation).

## Vérifier

```bash
pnpm check               # lint, format, types, tests unitaires
pnpm build && pnpm test:e2e   # PostgreSQL + Mailpit lancés (docker compose up db db-roles mailpit)
pnpm test:integration    # PostgreSQL réel ; requiert TEST_DATABASE_ADMIN_URL
```

## Organisation

- `src/app` : routes Next.js ; `src/domains` : logique métier par domaine ; `src/server` : sécurité, configuration, accès aux données ; `src/adapters` : connecteurs externes simulés.
- `docs/adr` : décisions d'architecture ; `docs/securite` : règles de sécurité.
