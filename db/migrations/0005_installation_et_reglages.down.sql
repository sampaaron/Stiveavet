-- Annule 0005. Supprime réglages, garde et installation : local, CI ou retour arrière validé.

ALTER TABLE followups DROP COLUMN is_test;
DROP TABLE onboarding_steps, integration_connections, on_call_schedules, emergency_contacts,
  emergency_instructions, availability_windows, organization_settings;
DROP FUNCTION app.check_on_call_vet();
DROP TYPE onboarding_step, integration_provider, availability_kind, emergency_period;
