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
cp .env.example .env     # puis renseigner POSTGRES_PASSWORD (valeur locale quelconque)
docker compose -f docker/compose.yaml --env-file .env up --build
```

Mailpit (e-mails capturés) : http://localhost:8025.

## Vérifier

```bash
pnpm check               # lint, format, types, tests unitaires
pnpm build && pnpm test:e2e
```

## Organisation

- `src/app` : routes Next.js ; `src/domains` : logique métier par domaine ; `src/server` : sécurité, configuration, accès aux données ; `src/adapters` : connecteurs externes simulés.
- `docs/adr` : décisions d'architecture ; `docs/securite` : règles de sécurité.
