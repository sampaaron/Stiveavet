-- Annule 0014. Supprime les demandes de rendez-vous, les durées et les contrôles de la base ;
-- local, CI ou retour arrière validé.

DROP TRIGGER appointments_checked ON appointments;
DROP FUNCTION app.check_appointment();
DROP FUNCTION app.may_confirm_appointment(uuid);
DROP FUNCTION app.within_appointment_window(timestamptz, timestamptz);
DROP TABLE appointment_requests;
DROP FUNCTION app.check_appointment_request();
DROP TYPE appointment_request_status;
DROP TABLE appointment_durations;
ALTER TABLE consents DROP CONSTRAINT consents_scope_withdrawn;
ALTER TABLE consents DROP COLUMN scope;
DROP TYPE consent_scope;
REVOKE UPDATE (stop_requested_at) ON followup_contacts FROM stivea_app;
ALTER TABLE followup_contacts DROP COLUMN stop_requested_at;
