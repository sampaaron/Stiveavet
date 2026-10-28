-- Annule 0034 ; local, CI ou retour arrière validé. Les accords déjà reçus restent notés.
REVOKE UPDATE (optin_code_hash, optin_code_expires_at, optin_code_by_membership_id)
  ON followup_contacts FROM stivea_app;
DROP INDEX followup_contacts_optin_code_idx;
ALTER TABLE followup_contacts
  DROP CONSTRAINT followup_contacts_optin_code_member,
  DROP CONSTRAINT followup_contacts_optin_code_complete,
  DROP COLUMN optin_code_by_membership_id,
  DROP COLUMN optin_code_expires_at,
  DROP COLUMN optin_code_hash;

REVOKE UPDATE (display_phone) ON whatsapp_accounts FROM stivea_app;
ALTER TABLE whatsapp_accounts DROP COLUMN display_phone;
