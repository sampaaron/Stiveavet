-- Annule 0008. Supprime conversations, consentements, triage, rendez-vous et tâches :
-- local, CI ou retour arrière validé.

DROP TRIGGER followups_status_history ON followups;
DROP TABLE notification_deliveries, job_attempts, scheduled_jobs, outbox_events, appointments,
  acknowledgements, alerts, triage_events, voice_transcripts, attachments, consents, messages,
  conversation_threads, followup_status_events, followup_contacts;
DROP FUNCTION app.record_followup_status(), app.check_voice_attachment();
ALTER TABLE alert_rules DROP CONSTRAINT alert_rules_org_id_key;
ALTER TABLE followups DROP CONSTRAINT followups_id_animal_key;
ALTER TABLE owner_contacts
  DROP CONSTRAINT owner_contacts_owner_id_key,
  DROP CONSTRAINT owner_contacts_org_id_key;
DROP TYPE delivery_status, delivery_channel, job_outcome, job_status, appointment_source,
  appointment_status, appointment_kind, alert_status, triage_source, attachment_kind,
  message_delivery, message_author, message_direction, thread_kind, consent_state,
  followup_contact_role;
