# Infrastructure Scaleway (staging)

Description versionnée du staging de Stivea Vet, région Paris (ADR 0028). **Rien n'est créé**
tant qu'Aaron n'a pas donné son feu vert (plan de la phase 3, partie B).

| Ressource            | Rôle                                                                     |
| -------------------- | ------------------------------------------------------------------------ |
| Réseau privé         | La base n'a aucune adresse publique ; seuls les conteneurs l'atteignent. |
| PostgreSQL 16 managé | Chiffré au repos, sauvegarde quotidienne gardée 14 jours.                |
| Bucket `…-objets`    | Photos, vocaux, captures : privé, versionné.                             |
| Scaleway Queues      | Signal de réveil du worker, sans aucune donnée.                          |
| Transactional Email  | E-mails de service et commerciaux, domaine vérifié (SPF, DKIM, DMARC).   |
| Conteneur `app`      | Next.js, seul point d'entrée public, HTTPS imposé.                       |
| Conteneur `worker`   | File de tâches, privé, une instance toujours active.                     |

## Mise en place (partie B, avec les comptes d'Aaron)

1. Créer le projet Scaleway et une clé d'API limitée à ce projet ; l'exporter dans
   `SCW_ACCESS_KEY`, `SCW_SECRET_KEY`, `SCW_DEFAULT_PROJECT_ID` (jamais dans un fichier).
2. Créer le bucket privé de l'état Terraform et y brancher un `backend "s3"` ; l'état
   contient des secrets et ne doit jamais être versionné.
3. Copier `staging.tfvars.example` vers `staging.tfvars`, fournir `TF_VAR_secrets`, puis
   `terraform init`, `terraform plan -var-file=staging.tfvars` : relire le plan avant
   tout `apply`.
4. Créer les rôles `stivea_migrator` et `stivea_app` avec `db/bootstrap/roles.sql`, depuis le
   réseau privé, puis `pnpm db:migrate`. `DATABASE_URL` et `MIGRATOR_DATABASE_URL` vont dans
   `TF_VAR_secrets`.
5. Poser les enregistrements DNS donnés par `terraform output email_dns_records`.

Secrets attendus dans `TF_VAR_secrets` : `DATABASE_URL`, `SCW_ACCESS_KEY`, `SCW_SECRET_KEY`,
`SCW_DEFAULT_PROJECT_ID`, `SECRETS_ENCRYPTION_KEYS`, `FILE_LINK_SECRET`, `META_APP_ID`,
`META_APP_SECRET`, `META_EMBEDDED_SIGNUP_CONFIG_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`,
`AI_API_KEY`, `AI_BASE_URL`, `AI_TEXT_MODEL`, `AI_VISION_MODEL`, `AI_TRANSCRIPTION_MODEL`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
