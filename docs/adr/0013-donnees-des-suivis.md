# 0013 — Données des suivis : contacts, consentements, conversations, triage, alertes et tâches

- Statut : accepté (7 octobre 2026)

## Contexte

Phase 2, lot 10 (plan validé par Aaron le 7 octobre 2026). Cahier des charges §4 à §9 : deux contacts par suivi, accord de chacun avant tout contenu clinique, `STOP` et `REPRENDRE`, conversations avec texte, photos et vocaux, triage en trois niveaux, alertes avec accusé de réception et escalade entre 3 et 5 heures, rendez-vous, rappels. Architecture §6, §7 et §9 : tables `followup_contacts`, `followup_status_events`, `consents`, `conversation_threads`, `messages`, `attachments`, `voice_transcripts`, `triage_events`, `alerts`, `acknowledgements`, `appointments`, `outbox_events`, `scheduled_jobs`, `job_attempts`, `notification_deliveries`.

## Décision

1. **Mêmes règles d'isolation que la phase 1** (ADR 0006) : `organization_id` partout, RLS forcée, clés étrangères composites. Elles empêchent en plus de ranger un message, une pièce jointe ou un consentement dans un autre suivi que le sien (clés `(followup_id, id)`).
2. **Historiques en ajout seul** : statuts, consentements, triage et accusés de réception ne se modifient jamais (déclencheur) et ne se suppriment pas (aucun droit `DELETE`). L'état courant d'un consentement est sa ligne la plus récente ; chaque ligne garde la version du texte montré et si le groupe partagé a été expliqué.
3. **Historique des statuts écrit par la base** : un déclencheur sur `followups` enregistre chaque changement, son auteur (la personne de la transaction) et un motif technique passé par `app.status_reason`. Aucun changement de statut ne peut échapper à l'historique.
4. **Contenus non modifiables** : le texte d'un message, une transcription, la clé d'un fichier ne se réécrivent pas ; seuls l'état d'envoi, l'effacement d'un fichier, l'état d'une alerte ou d'une tâche sont modifiables (droits par colonne).
5. **Contrôles en base** : un message sortant a toujours une clé d'idempotence unique ; l'auteur et le sens d'un message sont cohérents (Numa ne peut pas écrire comme un propriétaire) ; une pièce jointe n'a qu'une clé de stockage, jamais d'URL ; une capture d'agenda est gardée au plus un jour ; une conservation ne dépasse pas 15 mois (90 jours de suivi puis un an) ; une transcription ne porte que sur un vocal ; l'escalade d'une urgence est programmée entre 3 et 5 heures ; un seul groupe ouvert par suivi.
6. **Tâches** : `scheduled_jobs` porte une clé d'idempotence unique par cabinet ; charges utiles limitées à 2 Ko, faites d'identifiants ; erreurs réduites à un code, jamais de message brut. `outbox_events` reçoit les événements écrits dans la même transaction que le changement métier. Le worker et sa file arrivent au lot 11.
7. **Lecture du dossier** : `followupsService.open` renvoie désormais un `record`. Les contacts (sans numéro) sont visibles de qui voit le dossier ; messages, pièces jointes, transcriptions, triage et alertes ne sont lus en base que pour une personne qui a `clinical.read`. Les vues sont construites champ par champ.
8. **Domaines** : `conversations`, `urgences`, `agenda`, `taches` et `notifications` reçoivent leurs tables ; le jeu fictif remplit ces tables pour les deux cabinets à partir des données des écrans de référence.

## Conséquences

- Les tests d'intégration couvrent l'isolation de chaque nouvelle table, l'ajout seul, les droits par colonne, chaque contrôle ci-dessus et la lecture du dossier selon les droits (responsable, assistante, confrère sans partage, autre cabinet).
- Les écrans lisent encore les données figées du lot 2 ; ils passeront sur ces tables au lot 17.
- Les suivis créés avant cette migration reçoivent un premier événement d'historique (`history_start`).
