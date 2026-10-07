-- Annule 0010. Supprime la fiche de lancement des suivis : local, CI ou retour arrière validé.

UPDATE permissions SET label = 'Lancer un suivi' WHERE key = 'followups.launch';
DROP TABLE followup_alert_rules, followup_steps, followup_treatments, followup_imports;
DROP TYPE treatment_source;
DROP TRIGGER followups_status_transition ON followups;
DROP FUNCTION app.check_superseded_once(), app.check_treatment_change(),
  app.check_followup_transition(), app.short_texts(text[], integer, integer);
ALTER TABLE followups DROP COLUMN plan_revision, DROP COLUMN first_contact_at;
