# 0040 — Performances et robustesse sous charge

- Statut : accepté (23 octobre 2026)

## Contexte

L'audit des performances (octobre 2026) a relevé :

- des appels à l'IA et à WhatsApp faits pendant une transaction qui verrouille le suivi : un deuxième message du propriétaire attendait la fin de la rédaction de Numa (jusqu'à 30 s) ;
- un worker qui exécutait ses tâches une par une, avec un bail compté pour tout le lot : une tâche reprise ailleurs pendant son exécution pouvait renvoyer un message WhatsApp ;
- un prélèvement d'abonnement déclenché par l'affichage d'une page, sous verrou ;
- des pages qui ouvraient de nombreuses transactions (sept pour un dossier), relisaient tout l'historique du cabinet ou attendaient la synthèse de l'IA ;
- une synthèse réécrite à chaque changement de langue de lecture ;
- des totaux d'activité réduits par la politique `clinical_access` (0026) pour une personne sans accès clinique à tous les dossiers.

## Décision

1. **Exécutants en deux temps** (`StagedJobHandler`, `src/domains/taches/worker.ts`).
   - `prepare` lit dans une transaction courte, sans verrou, puis appelle le prestataire hors de toute transaction.
   - `commit` rouvre une transaction, reprend les verrous, revérifie l'état et écrit. L'idempotence est vérifiée à ce moment : clé `reply:<message>` pour Numa, transcription ou observation déjà présente, accord et réglage relus pour l'analyse photo.
   - Concernés : messages et rappels de Numa, envoi WhatsApp, téléchargement des médias, transcription des vocaux, analyse des photos.
   - Les étapes d'une conversation sont une table `étape → fonction` (`conversations/taches.ts`).
2. **Un envoi parti n'est jamais refait.** L'envoi WhatsApp déclare `keepOnLostLease` : si le bail a été perdu pendant l'appel, l'état « envoyé » est écrit quand même, sous verrou, et la reprise de la tâche ailleurs le voit. Les autres exécutants annulent leur écriture si le bail est perdu, comme avant.
3. **Worker parallèle, bail prolongé.**
   - Lots de 3 tâches (le pool du worker a 4 connexions), exécutés en parallèle.
   - Les tâches d'un même suivi restent dans l'ordre, l'une après l'autre.
   - Chaque lecture d'un exécutant en deux temps prolonge d'abord le bail de sa tâche, sans nouvelle fonction en base.
4. **Abonnement : une tâche quotidienne.**
   - `billing.sync` est planifiée une fois par jour et par cabinet par `jobs.plan_billing_syncs()` (migration 0028), sur le modèle de `jobs.plan_retention_sweeps`. Elle émet les échéances et prélève ; un prélèvement différé est retenté une heure plus tard.
   - La garde des droits (`memberContext`) ne fait plus que lire l'abonnement, dans la même transaction que les permissions.
5. **Lectures des pages.**
   - Page dossier : une seule transaction pour l'ouverture journalisée et les lectures cliniques (`followupsService.dossier`). Les liens des fichiers sont signés après la transaction. La synthèse est rendue à part, sous `<Suspense>`, avec un état d'attente accessible.
   - Synthèse gardée par suivi et par langue (clé `(followup_id, language)`, migration 0028).
   - Tableau de bord : seuls les suivis non terminés sont relus, et la dernière nouvelle de chaque suivi est lue par une jointure latérale.
   - Alertes en attente : deux compteurs lus une fois par requête (`cache`), sans relire les alertes.
   - Bureau des rendez-vous : 100 lignes au plus, visibilité calculée en une requête.
   - Le cabinet et la personne sont fixés en une instruction par transaction.
6. **Délais de la base pour l'application web** : `statement_timeout` (30 s) et `idle_in_transaction_session_timeout` (60 s). Ils sont réglables par `DATABASE_STATEMENT_TIMEOUT_MS` et `DATABASE_IDLE_TRANSACTION_TIMEOUT_MS`. Aucun appel extérieur fait dans une transaction ne dépasse 30 s.
7. **Totaux d'activité du cabinet.** `app.activity_messages(since)` et `app.activity_answered(since)` sont des fonctions `SECURITY DEFINER` (0028).
   - Elles sont limitées au cabinet courant et refusent un appel sans cabinet.
   - Elles ne renvoient que des compteurs.
   - Leur `search_path` finit par `pg_temp`. `EXECUTE` est retiré à `PUBLIC` et accordé à `stivea_app`.
8. **Fichiers** : aucun `HEAD` au stockage par fichier hors mode simulé ; réponse servie sans copie des octets.

## Conséquences

- Les tests d'intégration prouvent :
  - un deuxième message reçu pendant que Numa rédige n'attend pas l'IA ;
  - un envoi dont le bail est perdu pendant l'appel n'est jamais renvoyé ;
  - un lot s'exécute en parallèle, avec un bail prolongé avant l'appel ;
  - un réglage coupé pendant l'analyse d'une photo empêche d'en garder le résultat ;
  - la garde des droits n'émet ni ne prélève, et la tâche quotidienne ne prélève qu'une fois ;
  - une synthèse est gardée par langue ;
  - la page dossier lit dans la transaction de l'ouverture, et une lecture qui échoue annule la trace ;
  - les totaux d'activité sont les mêmes pour une assistante et pour l'administratrice.
- Le tableau de bord ne montre plus les suivis terminés dans la section du cabinet.
- Restent à faire :
  - la pagination de la liste des suivis ;
  - le passage en flux des fichiers servis (il demande une lecture en flux dans l'adaptateur de stockage) ;
  - la création et la fermeture des groupes WhatsApp, et la notification des alertes, qui appellent encore Meta sous verrou (délai de 15 s).
