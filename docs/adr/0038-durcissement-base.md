# 0038 — Durcissement de la base après l'audit

- Statut : accepté (23 octobre 2026)

## Contexte

L'audit de la couche données (octobre 2026) a relevé des écarts entre ce que les ADR 0006, 0020 et 0021 promettent et ce que la base impose :

- un suivi avec une demande de rendez-vous traitée par Numa ne s'effaçait jamais, et son effacement en échec n'était plus retenté ;
- les rendez-vous hors suivi, les traces d'authentification et les tables techniques n'avaient aucune durée de conservation ;
- deux cabinets recevaient le même numéro de facture, alors que Stivea Vet est l'unique émettrice ;
- le journal d'audit restait effaçable par le propriétaire du schéma ;
- l'accès clinique (droit `clinical.read`, dossier privé) n'était imposé que par l'application ;
- des droits de mise à jour couvraient des tables entières, des contrôles de concurrence manquaient, et des fonctions `SECURITY DEFINER` cherchaient d'abord dans le schéma temporaire.

## Décision

Une migration, `0026_durcissement_base`, réversible comme les autres.

1. **Conservation.**
   - `app.purge_followup` efface les demandes de rendez-vous avant les rendez-vous.
   - La tâche `followup.purge` porte une clé propre à chaque balayage. Un effacement resté en échec est donc retenté le lendemain. Un effacement encore programmé n'est pas doublé.
   - Le balayage quotidien du cabinet appelle aussi :
     - `app.purge_past_appointments()` : rendez-vous sans suivi finis depuis un an. Les animaux et propriétaires qui ne servent plus sont ensuite effacés.
     - `app.purge_technical_records()` : tâches terminées, événements publiés, webhooks et notifications de plus de 90 jours.
   - Le premier passage du jour (`jobs.plan_retention_sweeps`) appelle `auth.purge_expired()`. Elle efface :
     - les sessions, codes, liens et appareils expirés ou retirés depuis 30 jours ;
     - les compteurs dont la fenêtre est passée ;
     - le journal de connexion au-delà de 12 mois.
2. **Factures.**
   - `app.next_invoice_number(année)` tient un compteur par année (`app.invoice_counters`), verrouillé jusqu'à la fin de la transaction qui émet. Une émission annulée rend son numéro : aucun trou.
   - `invoices.number` est unique tous cabinets confondus.
   - Les factures déjà émises (données fictives) sont renumérotées dans l'ordre d'émission.
3. **Droits par colonne.**
   - `stivea_app` ne met à jour que les colonnes que l'application modifie réellement dans `organizations`, `users`, `memberships`, `followups`, `invitations` et `followup_shares`.
   - Deux déclencheurs s'appliquent même au propriétaire :
     - la personne d'un membre ne change jamais ;
     - `is_test` est figé dès qu'un suivi n'est plus un brouillon.
   - Le compte Stripe ne cite qu'un membre de son cabinet (clé composite).
4. **Journaux.**
   - `audit_events` refuse `DELETE` et `TRUNCATE`, même au propriétaire.
   - `login_events` refuse `TRUNCATE`. Une ligne n'y est effaçable qu'après 12 mois : un déclencheur le vérifie, et seule `auth.purge_expired()` a une politique pour le faire.
   - Le chaînage d'empreintes ou l'export vers un stockage non modifiable reste à faire.
5. **Accès clinique imposé par la base.**
   - Une politique restrictive `clinical_access` porte sur `messages`, `voice_transcripts`, `photo_observations`, `followup_syntheses`, `triage_events`, `followup_imports` et `followup_treatments`.
   - Elle reproduit `followupAccess` au niveau « clinique » :
     - il faut d'abord `clinical.read` ;
     - puis il faut être responsable ou avoir un partage actif, avec `followups.read_own` ou `read_all` ;
     - ou bien le dossier n'est pas privé, avec `read_all` ou `read_summary`.
   - La liste des dossiers lisibles (`app.clinical_followup_ids()`) est calculée une fois par requête.
   - Sans personne connectée (worker, webhooks), seul le filtre du cabinet s'applique.
   - Les permissions viennent de `membership_permissions` : un droit accordé seulement en mémoire ne suffit plus.
6. **Concurrence.**
   - Le contrôle « au moins un administrateur actif » est sérialisé par cabinet (verrou consultatif de transaction). Il lève la contrainte nommée `memberships_keep_one_admin`.
   - `auth.resolve_session` lit la session sans verrou de ligne. Il n'écrit la dernière activité qu'une fois par minute au plus, et ne journalise `session_locked` que s'il a lui-même verrouillé la session.
   - Le verrouillage d'inactivité devient précis à la minute (ADR 0036).
   - Les migrations prennent un verrou consultatif : deux déploiements simultanés s'attendent.
7. **`pg_temp` en dernier** dans le `search_path` de toutes les fonctions `SECURITY DEFINER`. Un test le vérifie pour toute nouvelle fonction.
8. **Index** sur les clés étrangères parcourues par les cascades, et sur les filtres fréquents :
   - « mes suivis », registre, envoi WhatsApp ;
   - statistiques, alertes non closes, dernier suivi terminé.

   Ils sont créés sans `CONCURRENTLY`, car chaque migration tourne dans une transaction : sur une grosse base, prévoir une fenêtre de maintenance.

## Conséquences

- **Statistiques du tableau de bord.** `statsService.activity` compte les messages sous l'identité de la personne. Une assistante sans `clinical.read`, ou un vétérinaire limité à ses suivis, voit désormais des totaux de messages réduits à ses dossiers. Pour garder des totaux du cabinet, il faudra une fonction d'agrégat `SECURITY DEFINER` appelée par `statistiques.ts`, qui ne renvoie que des nombres.
- **Rôle séparé pour le worker : pas encore fait.** Le simulateur de `src/server/services.ts` exécute la file dans le processus web, et le webhook WhatsApp appelle `jobs.fail_after_success`. Retirer `jobs.*` à `stivea_app` casserait donc l'application. Il faudra :
  - un rôle `stivea_worker` dans `db/bootstrap/roles.sql` ;
  - une variable `WORKER_DATABASE_URL` lue par `scripts/worker.mts` et l'infrastructure ;
  - un worker de simulation branché sur ce rôle ;
  - un webhook qui passe par une tâche ;
  - enfin, une migration qui réserve `jobs.*` et les purges à `stivea_worker`.
- Les ADR 0006 (journal, droits) et 0020 (conservation) restent valables, précisées par celle-ci.
- La procédure de création des rôles et de la base en production est décrite dans `docs/DEVELOPPEMENT.md`.
