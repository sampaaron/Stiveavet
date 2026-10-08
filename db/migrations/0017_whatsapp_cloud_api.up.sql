-- 0017 : WhatsApp Business Cloud API (phase 3, lot 21, ADR 0024).
--
-- Hors de la fenêtre de 24 h ouverte par le dernier message du propriétaire, WhatsApp
-- n'accepte que des modèles approuvés. Un message sortant est donc :
-- - un modèle (`template_key`) : texte fixe du catalogue, le corps est le texte rendu ;
-- - ou un message libre, qui ne part que fenêtre ouverte ; sinon il attend la prochaine
--   réponse du propriétaire (`awaiting_reply`) et une invitation à répondre part en modèle.
-- Le corps reste non modifiable par l'application : ce qui est gardé est ce qui est envoyé.

ALTER TYPE message_delivery ADD VALUE 'awaiting_reply' AFTER 'queued';

ALTER TABLE messages
  ADD COLUMN template_key text CHECK (template_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  ADD COLUMN template_params text[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(template_params) <= 10),
  ADD CONSTRAINT messages_template_outbound
    CHECK (template_key IS NULL OR direction = 'outbound'),
  ADD CONSTRAINT messages_params_need_template
    CHECK (template_key IS NOT NULL OR cardinality(template_params) = 0);

-- Numéro WhatsApp Business du cabinet, connecté par l'inscription intégrée de Meta. Le jeton
-- d'accès est chiffré par l'application (AES-256-GCM, clé hors base, contexte = cabinet) :
-- une copie de la base seule ne permet pas d'écrire au nom d'un cabinet.
CREATE TABLE whatsapp_accounts (
  organization_id uuid PRIMARY KEY REFERENCES organizations (id),
  waba_id text NOT NULL CHECK (waba_id ~ '^[0-9]{5,30}$'),
  phone_number_id text NOT NULL UNIQUE CHECK (phone_number_id ~ '^[0-9]{5,30}$'),
  access_token_sealed text NOT NULL CHECK (access_token_sealed ~ '^v1\.[a-z0-9-]{1,32}\.[A-Za-z0-9_.-]+$'),
  connected_by_membership_id uuid NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, connected_by_membership_id) REFERENCES memberships (organization_id, id)
);

-- Événements reçus des prestataires, gardés une seule fois : un webhook rejoué est ignoré.
-- Aucun contenu : une clé (identifiant du prestataire) et un type.
CREATE TABLE webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  provider text NOT NULL CHECK (provider IN ('whatsapp')),
  event_key text NOT NULL
    CHECK (char_length(event_key) BETWEEN 8 AND 400 AND event_key ~ '^[A-Za-z0-9:._=+/-]+$'),
  kind text NOT NULL CHECK (kind ~ '^[a-z_]{2,40}$'),
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider, event_key)
);
CREATE INDEX webhook_events_received_idx ON webhook_events (received_at);

-- Numéro WhatsApp professionnel choisi par chaque vétérinaire pour les alertes urgentes
-- (cahier des charges §4) ; jamais son numéro personnel par défaut.
ALTER TABLE memberships
  ADD COLUMN alert_phone text CHECK (alert_phone ~ '^\+[1-9][0-9]{7,14}$');

-- Accord préalable du propriétaire pour être contacté sur WhatsApp, recueilli au cabinet
-- (politique WhatsApp : pas de premier message sans accord donné ailleurs). Le premier message
-- de Numa le confirme, puis demande l'accord au suivi clinique (cahier des charges §4).
ALTER TABLE followup_contacts
  ADD COLUMN whatsapp_optin_at timestamptz,
  ADD COLUMN whatsapp_optin_by_membership_id uuid,
  ADD CONSTRAINT followup_contacts_optin_by
    CHECK ((whatsapp_optin_at IS NULL) = (whatsapp_optin_by_membership_id IS NULL)),
  ADD CONSTRAINT followup_contacts_optin_member
    FOREIGN KEY (organization_id, whatsapp_optin_by_membership_id) REFERENCES memberships (organization_id, id);

-- Identifiant WhatsApp propre au cabinet (« business-scoped user id ») : depuis 2026, le
-- numéro peut manquer dans les webhooks ; cet identifiant relie alors le message au contact.
ALTER TABLE owner_contacts
  ADD COLUMN whatsapp_user_id text CHECK (whatsapp_user_id ~ '^[A-Z]{2}\.[0-9]{5,40}$');
CREATE UNIQUE INDEX owner_contacts_whatsapp_user_idx
  ON owner_contacts (organization_id, whatsapp_user_id) WHERE whatsapp_user_id IS NOT NULL;

-- La connexion WhatsApp peut désormais être réelle ; dr.veto et le prélèvement restent
-- simulés jusqu'à leurs propres lots.
ALTER TABLE integration_connections DROP CONSTRAINT integration_connections_mode_check;
ALTER TABLE integration_connections
  ADD CONSTRAINT integration_connections_mode_check
  CHECK (mode = 'simulated' OR (mode = 'live' AND provider = 'whatsapp'));

-- File de tâches : un envoi par tâche (architecture §9). Deux issues de plus :
-- - abandon immédiat d'un échec définitif (numéro injoignable, modèle refusé, compte à
--   reconnecter) : le retenter ne servirait à rien, il apparaît tout de suite en échec ;
-- - échec connu après coup : Meta a accepté l'envoi puis signale qu'il n'est pas arrivé ;
--   la tâche réussie repasse en échec, visible et relançable.
CREATE FUNCTION jobs.give_up(p_job uuid, p_worker text, p_attempt integer, p_code text) RETURNS boolean
  LANGUAGE plpgsql SET search_path = pg_catalog, public
  AS $$
  BEGIN
    UPDATE scheduled_jobs SET status = 'dead', locked_by = NULL, locked_until = NULL,
      last_error_code = p_code, finished_at = now()
    WHERE id = p_job AND status = 'running' AND locked_by = p_worker AND attempts = p_attempt;
    IF NOT FOUND THEN RETURN false; END IF;
    UPDATE job_attempts SET finished_at = now(), outcome = 'failed', error_code = p_code
    WHERE job_id = p_job AND attempt_number = p_attempt AND outcome IS NULL;
    RETURN true;
  END $$;

CREATE FUNCTION jobs.fail_after_success(p_job uuid, p_code text) RETURNS boolean
  LANGUAGE plpgsql SET search_path = pg_catalog, public
  AS $$
  BEGIN
    UPDATE scheduled_jobs SET status = 'dead', last_error_code = p_code, finished_at = now()
    WHERE id = p_job AND status = 'succeeded';
    RETURN FOUND;
  END $$;

REVOKE ALL ON FUNCTION jobs.give_up(uuid, text, integer, text), jobs.fail_after_success(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jobs.give_up(uuid, text, integer, text), jobs.fail_after_success(uuid, text) TO stivea_app;

ALTER TABLE whatsapp_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON whatsapp_accounts
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON webhook_events
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());

-- Un webhook arrive sans cabinet : seule cette fonction relie le numéro Meta au cabinet,
-- et ne renvoie que son identifiant (rien du jeton).
CREATE POLICY webhook_routing ON whatsapp_accounts FOR SELECT TO stivea_migrator USING (true);
CREATE FUNCTION app.whatsapp_organization(p_phone_number_id text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
  AS $$
    SELECT organization_id FROM whatsapp_accounts
    WHERE p_phone_number_id ~ '^[0-9]{5,30}$' AND phone_number_id = p_phone_number_id
  $$;
REVOKE ALL ON FUNCTION app.whatsapp_organization(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.whatsapp_organization(text) TO stivea_app;

GRANT SELECT, INSERT, UPDATE (waba_id, phone_number_id, access_token_sealed, connected_by_membership_id, connected_at), DELETE
  ON whatsapp_accounts TO stivea_app;
GRANT SELECT, INSERT ON webhook_events TO stivea_app;
GRANT UPDATE (mode, display_label) ON integration_connections TO stivea_app;
GRANT UPDATE (alert_phone) ON memberships TO stivea_app;
GRANT UPDATE (whatsapp_optin_at, whatsapp_optin_by_membership_id) ON followup_contacts TO stivea_app;
