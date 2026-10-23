# Infrastructure Scaleway (staging)

Description versionnée du staging de Stivea Vet, région Paris (ADR 0028). **Rien n'est créé**
tant qu'Aaron n'a pas donné son feu vert (plan de la phase 3, partie B).

| Ressource            | Rôle                                                                     |
| -------------------- | ------------------------------------------------------------------------ |
| Réseau privé         | La base n'a aucune adresse publique ; seuls les conteneurs l'atteignent. |
| PostgreSQL 16 managé | Chiffré au repos, sauvegarde quotidienne gardée 14 jours.                |
| Bucket `…-objets`    | Photos, vocaux, captures : privé, versionné, versions effacées purgées.  |
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
   réseau privé. Seul `DATABASE_URL` (rôle `stivea_app`) va dans `TF_VAR_secrets`.
5. Poser les enregistrements DNS donnés par `terraform output email_dns_records`.

## Migrations : tâche ponctuelle, hors des conteneurs (ADR 0041)

Le rôle `stivea_migrator` possède les tables et pourrait lever la RLS : son URL n'est jamais
donnée aux conteneurs `app` et `worker`. Terraform refuse `MIGRATOR_DATABASE_URL` dans
`TF_VAR_secrets`.

1. La CI construit l'image `--target migrate` du même commit que l'application.
2. Avant chaque déploiement, une personne habilitée la lance une fois depuis le réseau privé
   (instance ou bastion temporaire), avec le secret lu au dernier moment dans le gestionnaire
   de secrets et passé à ce seul lancement :
   `docker run --rm -e MIGRATOR_DATABASE_URL rg.fr-par.scw.cloud/stivea-staging/migrate:<commit>`.
3. Une fois les migrations appliquées, on déploie `app` puis `worker` (`terraform apply`).

Secrets attendus dans `TF_VAR_secrets` : `DATABASE_URL`, `SCW_ACCESS_KEY`, `SCW_SECRET_KEY`,
`SCW_DEFAULT_PROJECT_ID`, `SECRETS_ENCRYPTION_KEYS`, `FILE_LINK_SECRET`, `META_APP_ID`,
`META_APP_SECRET`, `META_EMBEDDED_SIGNUP_CONFIG_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`,
`AI_API_KEY`, `AI_BASE_URL`, `AI_TEXT_MODEL`, `AI_VISION_MODEL`, `AI_TRANSCRIPTION_MODEL`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `FINGERPRINT_SECRET`.

`FINGERPRINT_SECRET` est la clé HMAC des empreintes d'adresse IP et d'e-mail, commune à
l'application et au worker (Terraform la refuse absente ou trop courte). Elle se tire une
fois par environnement, directement dans le gestionnaire de secrets, sans jamais l'écrire
dans un fichier : `openssl rand -base64 48`.
