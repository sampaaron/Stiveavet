-- Annule 0015 ; local, CI ou retour arrière validé.

ALTER TABLE messages DROP CONSTRAINT messages_note_system_only;
ALTER TABLE messages DROP COLUMN note_names;
ALTER TABLE messages DROP COLUMN note_code;
ALTER TABLE triage_events DROP CONSTRAINT triage_events_reason_code_source;
ALTER TABLE triage_events DROP COLUMN reason_code;
REVOKE UPDATE (language_source) ON followup_contacts FROM stivea_app;
ALTER TABLE followup_contacts DROP COLUMN language_source;
DROP TYPE language_source;
ALTER TABLE users DROP COLUMN ui_locale;
