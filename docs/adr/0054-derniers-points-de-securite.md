# 0054 — Derniers points de sécurité avant la sortie

- Statut : accepté (31 octobre 2026), demande d'Aaron : « go » sur les points laissés en attente par l'audit du 23 octobre
- Complète les ADR 0038 (base) et 0039 (comptes)

## Contexte

L'audit du 23 octobre avait laissé trois points de côté : une inscription non confirmée réservait l'adresse d'un tiers, le worker partageait le rôle de l'application web, et les numéros de téléphone n'étaient pas chiffrés en base. Ils sont tranchés ici, avant le premier vrai cabinet.

## Décision

1. **Inscription en attente** (migration 0036).
   - `register` ne crée plus ni cabinet ni personne. L'inscription attend son code dans `auth.pending_signups`, avec l'empreinte du mot de passe, pendant la durée de vie d'un code.
   - Le bon code crée le cabinet, le vétérinaire administrateur, l'abonnement et le journal d'audit, puis ouvre la session. C'est la preuve que la personne reçoit les e-mails de l'adresse.
   - Plusieurs inscriptions peuvent attendre pour la même adresse : la première confirmée l'emporte, les autres reçoivent l'e-mail « un compte existe déjà ».
   - Les inscriptions échues sont effacées dès la suivante et par `auth.purge_expired()`. L'application n'a aucun droit sur la table, seulement sur deux fonctions.
   - Les codes d'inscription se comptent par adresse (`signup:<adresse>`), à part des codes de connexion.
2. **Rôle `stivea_worker`** (migration 0037), prévu par l'ADR 0038.
   - Il hérite de `stivea_app` : mêmes tables, même RLS. Il reçoit seul `jobs.*` et les purges (`app.purge_*`).
   - L'application web ne garde que `jobs.fail_after_success`, appelée par le webhook WhatsApp quand Meta signale l'échec d'un message déjà parti.
   - Le worker lit `WORKER_DATABASE_URL`. En local, le simulateur du propriétaire l'utilise aussi. Terraform ne donne `WORKER_DATABASE_URL` qu'au worker et `DATABASE_URL` qu'à l'application.
   - Une faille de l'application web ne permet donc plus de prendre, clore ou relancer une tâche, ni d'effacer des données avant leur échéance.
3. **Numéros de téléphone : pas de chiffrement par colonne.**
   - La base de staging et de production est chiffrée au repos, sauvegardes comprises (`encryption_at_rest`, ADR 0028), ce que demande le cahier des charges.
   - Un chiffrement par l'application ne protégerait que d'une copie brute de la base. Or l'application doit lire les numéros pour écrire sur WhatsApp : sa clé serait dans les mêmes conteneurs. Les messages des propriétaires, plus sensibles que les numéros, restent lisibles dans une telle copie.
   - Il casserait la recherche d'un propriétaire par une partie de son numéro dans le registre.
   - À revoir si le test d'intrusion ou le juriste le demandent : il faudrait alors chiffrer aussi les messages, avec une clé gérée hors de l'application (KMS).

## Conséquences

- **Avant cette migration**, le rôle `stivea_worker` doit exister : `db/bootstrap/roles.sql` avec `worker_password` en local et en CI, l'administrateur de la base en staging et en production. Sinon la migration 0037 s'arrête avec un message clair.
- En local, `.env` gagne `STIVEA_WORKER_PASSWORD` et `WORKER_DATABASE_URL`. Docker Compose les exige.
- Une nouvelle fonction réservée au worker se donne à `stivea_worker`, jamais à `stivea_app`. Les tests d'intégration ouvrent ce rôle par `workerDatabase()` ou `asWorker()`.
