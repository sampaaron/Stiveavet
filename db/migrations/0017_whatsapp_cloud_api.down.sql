-- Annule 0017 ; local, CI ou retour arrière validé. Les messages en attente de réponse
-- repassent « en attente d'envoi » ; les jetons chiffrés et les événements reçus sont perdus.

REVOKE UPDATE (whatsapp_optin_at, whatsapp_optin_by_membership_id) ON followup_contacts FROM stivea_app;
REVOKE UPDATE (alert_phone) ON memberships FROM stivea_app;
REVOKE UPDATE (mode, display_label) ON integration_connections FROM stivea_app;

DROP FUNCTION app.whatsapp_organization(text);
DROP FUNCTION jobs.give_up(uuid, text, integer, text);
DROP FUNCTION jobs.fail_after_success(uuid, text);
DROP TABLE webhook_events;
DROP TABLE whatsapp_accounts;

-- Tous cabinets confondus : la RLS forcée est levée le temps de la suppression.
ALTER TABLE integration_connections NO FORCE ROW LEVEL SECURITY;
DELETE FROM integration_connections WHERE mode <> 'simulated';
ALTER TABLE integration_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE integration_connections DROP CONSTRAINT integration_connections_mode_check;
ALTER TABLE integration_connections
  ADD CONSTRAINT integration_connections_mode_check CHECK (mode = 'simulated');

DROP INDEX owner_contacts_whatsapp_user_idx;
ALTER TABLE owner_contacts DROP COLUMN whatsapp_user_id;
ALTER TABLE followup_contacts
  DROP CONSTRAINT followup_contacts_optin_member,
  DROP CONSTRAINT followup_contacts_optin_by,
  DROP COLUMN whatsapp_optin_by_membership_id,
  DROP COLUMN whatsapp_optin_at;
ALTER TABLE memberships DROP COLUMN alert_phone;

ALTER TABLE messages
  DROP CONSTRAINT messages_params_need_template,
  DROP CONSTRAINT messages_template_outbound,
  DROP COLUMN template_params,
  DROP COLUMN template_key;

-- Une valeur d'énumération ne se retire pas : le type est recréé sans elle.
ALTER TABLE messages NO FORCE ROW LEVEL SECURITY;
UPDATE messages SET delivery_status = 'queued' WHERE delivery_status = 'awaiting_reply';
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
ALTER TYPE message_delivery RENAME TO message_delivery_0017;
CREATE TYPE message_delivery AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed');
ALTER TABLE messages
  ALTER COLUMN delivery_status TYPE message_delivery
  USING delivery_status::text::message_delivery;
DROP TYPE message_delivery_0017;
