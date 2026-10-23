# 0041 — Infrastructure et hygiène du code

- Statut : accepté (23 octobre 2026)
- Complète les ADR 0014 (file de tâches), 0019 et 0020 (fichiers et conservation), 0028 (infrastructure Scaleway)

## Contexte

L'audit complet d'octobre 2026 a relevé des failles d'infrastructure : secrets Terraform locaux copiables dans l'image du worker, rôle migrateur injecté dans les conteneurs qui tournent, fichiers « effacés » gardés dans le bucket versionné, actions de CI épinglées sur des tags modifiables. Il a aussi relevé des défauts de propreté : configuration du worker non validée, doublons d'e-mails à la reprise d'une tâche, aides copiées, tests dépendants de l'horloge réelle et aucune règle ESLint fondée sur les types.

## Décision

1. **Images.** `.dockerignore` exclut `infra/`, les états et variables Terraform et les clés `.pem`. Le worker et les migrations sont compilés par esbuild (`pnpm build:scripts`) en un fichier autonome. Leurs images (`--target worker`, `--target migrate`) ne contiennent que ce fichier, sans `node_modules`, sources ni outils de développement, et tournent sans root. Toutes les images de base sont épinglées par empreinte.
2. **Rôle migrateur hors des conteneurs.** `MIGRATOR_DATABASE_URL` n'est jamais donné à `app` ni à `worker`, et Terraform le refuse dans `var.secrets`. Les migrations sont une tâche ponctuelle : l'image `migrate` du même commit, lancée depuis le réseau privé avant le déploiement, avec le secret passé à ce seul lancement (`infra/scaleway/README.md`). Serverless Jobs n'atteint pas encore le réseau privé ; ce n'est donc pas un job Terraform.
3. **Effacement réel des fichiers.** Sur le bucket versionné, l'adaptateur Scaleway liste les versions de la clé et efface chacune par son identifiant, marqueurs compris. Une règle de cycle de vie expire les versions non courantes après un jour et nettoie les marqueurs orphelins, en filet de sécurité (fournisseur Scaleway ≥ 2.77).
4. **Configuration du worker validée** (`taches/config.ts`) : `DATABASE_URL`, `WORKER_INTERVAL_MS` borné entre 500 et 60 000 ms, et `APP_URL` en HTTPS obligatoire hors local. L'adresse publique est passée au registre des tâches : le domaine ne lit plus `process.env`.
5. **Un envoi par destinataire.** L'offre d'engagement annuel inscrit une tâche par responsable de la facturation (clé `annual_offer:<motif>:<membre>`) : une panne chez l'un, puis la reprise, ne renvoie jamais l'e-mail aux autres (ADR 0014 §6).
6. **CI.** Chaque action est épinglée sur son SHA, avec le tag en commentaire. Dependabot relève les actions et les images. Chaque job a un délai maximal, et une poussée n'annule que l'exécution d'une PR, jamais celle de `main`. pnpm est épinglé par empreinte SHA-512.
7. **Hygiène du code.**
   - L'heure de Paris vit dans un seul module, `domains/heure-paris.ts`.
   - Les petites aides ne sont écrites qu'une fois : `fields`, `initials`, `Fact`, `concatBytes`, `clientIp`.
   - Les fonctions trop longues sont découpées, sans changement de comportement.
   - ESLint applique `no-floating-promises`, `no-misused-promises`, `no-non-null-assertion` et `no-unnecessary-type-assertion`.
   - La couverture de 100 % s'étend aux droits, à la CSP, à l'assainissement des erreurs de base et à l'adresse IP du client.
   - Les tests de facturation tournent à horloge fixe, avec un cas avant et un cas après la fin de l'offre de lancement.
   - `Actor`, `DomainError` et `assertPermission`, communs à tous les domaines, vivent dans `domains/commun/actor.ts`, à côté des petites aides de `domains/commun/utilitaires.ts`.

## Conséquences

- Construire l'image du worker ne recompile plus rien au démarrage. Une dépendance qui ne se laisse pas compiler devra être déclarée externe dans `build:scripts`.
- Chaque déploiement suit un ordre fixe : migrations d'abord, puis l'application et le worker.
- Une suppression de fichier coûte une requête de liste en plus. En contrepartie, l'effacement promis par les ADR 0019 et 0020 est réel.
- `terraform validate` n'a pas pu être lancé dans l'environnement de travail (registre Terraform injoignable). Seuls le format et le schéma du fournisseur ont été vérifiés.
