-- Annule 0004. Supprime les protocoles : local, CI ou retour arrière validé.

DROP TRIGGER followups_protocol_fixed ON followups;
ALTER TABLE followups DROP COLUMN protocol_version_id;
DROP TABLE alert_rules, protocol_steps;
ALTER TABLE protocols DROP COLUMN current_version_id, DROP COLUMN duplicated_from_version_id;
DROP TABLE protocol_versions, protocols;
DROP FUNCTION app.protocol_version_validation_only(),
  app.protocol_identity_fixed(), app.followup_protocol_fixed();
DROP TYPE alert_level, protocol_step_kind, protocol_species, protocol_category;
ALTER TABLE permissions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE role_permissions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE membership_permissions NO FORCE ROW LEVEL SECURITY;
DELETE FROM membership_permissions WHERE permission = 'protocols.create_own';
DELETE FROM role_permissions WHERE permission = 'protocols.create_own';
DELETE FROM permissions WHERE key = 'protocols.create_own';
ALTER TABLE permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE membership_permissions FORCE ROW LEVEL SECURITY;
