# 0014 — File de tâches : PostgreSQL d'abord, worker séparé, reprises et tâches en échec

- Statut : accepté (7 octobre 2026)

## Contexte

Phase 2, lot 11. Architecture §9 : chaque envoi, rappel, alerte, transcription, purge ou synchronisation est une tâche inscrite d'abord dans PostgreSQL avec un identifiant unique, traitée par un worker séparé ; tentatives espacées ; après plusieurs échecs, la tâche est visible dans une file d'erreur et dans l'application ; aucun doublon d'envoi, même après une panne. En production, Scaleway Queues et Serverless Jobs ; aucun compte externe pour l'instant.

## Décision

1. **La table `scheduled_jobs` est la file** (FOR UPDATE SKIP LOCKED). Le worker est un processus Node séparé (`pnpm worker`, service `worker` de Docker Compose, cible `worker` de l'image). Scaleway Queues pourra remplacer la prise des tâches sans toucher aux domaines : ils n'utilisent que `enqueue` et `emit`.
2. **Prise des tâches hors cabinet, exécution dans le cabinet** : seule `jobs.claim` (SECURITY DEFINER) voit toutes les tâches ; elle ne renvoie que l'identifiant, le cabinet, le type, la tentative et une charge utile faite d'identifiants. L'exécutant tourne ensuite dans `withTenant` du cabinet de la tâche, sous RLS, avec le rôle applicatif ; la réussite est écrite dans la même transaction que ses effets.
3. **Un worker ne prend que les types qu'il sait exécuter** : une tâche d'un type livré plus tard attend sans échouer.
4. **Bail et reprise** : une tâche prise l'est pour un bail (5 min par défaut). Si le worker s'arrête, la tâche est reprise au passage suivant (motif `lease_expired`) ; l'ancien worker ne peut plus rien écrire (réussite et échec vérifient le worker et la tentative).
5. **Tentatives espacées** : 1 min, 5 min, 15 min, 1 h, puis 3 h ; 5 tentatives par défaut, puis « en échec ». Chaque tentative est tracée dans `job_attempts`.
6. **Idempotence** : une tâche n'est inscrite qu'une fois par clé ; l'outbox est publiée avec des clés dérivées de l'événement, donc une relecture ne crée pas de doublon ; l'exécutant reçoit une clé stable d'une tentative à l'autre, à transmettre aux prestataires (WhatsApp, e-mail) pour qu'une panne entre l'envoi et l'enregistrement ne produise jamais deux messages.
7. **Aucune donnée sensible dans la file** : charges utiles limitées aux identifiants et codes (Zod et contrôle de taille en base) ; seul un code d'erreur est enregistré, jamais le message d'une exception ; les journaux du worker ne contiennent que des compteurs.
8. **Tâches en échec** : écran « Tâches en échec » pour qui a `organization.settings`, sans contenu clinique (type, motif, tentatives, dates, lien vers le dossier soumis à ses propres droits). Relancer remet la tâche en file avec une nouvelle série de tentatives ; abandonner la clôt. Les deux actions sont journalisées.

9. **Exécution parallèle et exécutants en deux temps** (révision du 23 octobre 2026, ADR 0040).
   - Le worker prend 3 tâches à la fois et les exécute en parallèle. Les tâches d'un même suivi gardent leur ordre.
   - Un exécutant qui appelle un prestataire lent lit d'abord, appelle hors transaction, puis écrit sous verrou après avoir revérifié l'état. Chaque lecture prolonge le bail de la tâche.
   - Un envoi parti chez le prestataire est enregistré même si le bail a été perdu pendant l'appel, pour ne jamais être refait.
10. **Outbox** : `emit` et `enqueue` demandent le réveil du worker après l'insertion. Les événements `followup.launched`, `followup.ended` et `message.received` n'ont pas encore de destinataire (`OUTBOX_ROUTES` vide).
    - Ils sont réservés aux intégrations à venir (dr.veto, statistiques) et sont publiés sans effet.
    - Ils restent écrits pour que ces intégrations reprennent l'historique sans modifier les domaines.
    - Ils sont purgés après 90 jours avec les autres tables techniques (ADR 0038).

## Conséquences

- Les tests d'intégration prouvent : inscription unique, exécution sous le bon cabinet, calendrier des tentatives, mise en échec, annulation des écritures d'une exécution ratée, absence de prise double entre deux workers concurrents, reprise après arrêt d'un worker, absence de doublon chez le prestataire après une panne, publication unique de l'outbox, droits et isolation de l'écran.
- Les exécutants réels (rappels, messages de Numa, escalades) arrivent avec les lots 12 à 15 dans `src/domains/taches/registry.ts`.
