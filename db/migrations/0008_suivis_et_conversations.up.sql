-- 0008 : contacts et consentements des suivis, conversations, pièces jointes, triage,
-- alertes, rendez-vous et tâches (phase 2, lot 10).
--
-- Cahier des charges §4 à §9, architecture §6, §7 et §9. Mêmes règles que les migrations
-- précédentes : organization_id partout, RLS forcée, clés étrangères composites qui
-- empêchent toute référence vers un autre cabinet ou un autre suivi. Les historiques qui
-- servent de preuve (statuts, consentements, triage, accusés de réception) sont en ajout seul.
-- Les charges utiles des tâches ne portent que des identifiants, jamais de contenu clinique.

CREATE TYPE followup_contact_role AS ENUM ('primary', 'secondary');
CREATE TYPE consent_state AS ENUM ('requested', 'given', 'withdrawn');
CREATE TYPE thread_kind AS ENUM ('direct', 'group');
CREATE TYPE message_direction AS ENUM ('inbound', 'outbound', 'internal');
CREATE TYPE message_author AS ENUM ('owner', 'numa', 'vet', 'system');
CREATE TYPE message_delivery AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed');
CREATE TYPE attachment_kind AS ENUM ('photo', 'voice', 'document', 'agenda_capture');
CREATE TYPE triage_source AS ENUM ('rule', 'ai', 'vet');
CREATE TYPE alert_status AS ENUM ('open', 'acknowledged', 'escalated', 'resolved');
CREATE TYPE appointment_kind AS ENUM ('post_op_control', 'emergency', 'treatment_followup', 'other');
CREATE TYPE appointment_status AS ENUM ('proposed', 'confirmed', 'cancelled');
CREATE TYPE appointment_source AS ENUM ('numa', 'staff', 'drveto');
CREATE TYPE job_status AS ENUM ('pending', 'running', 'succeeded', 'dead', 'cancelled');
CREATE TYPE job_outcome AS ENUM ('succeeded', 'failed');
CREATE TYPE delivery_channel AS ENUM ('whatsapp', 'desktop', 'email');
CREATE TYPE delivery_status AS ENUM ('pending', 'sent', 'delivered', 'failed');

-- Clés composites nécessaires aux références croisées ci-dessous.
ALTER TABLE owner_contacts
  ADD CONSTRAINT owner_contacts_org_id_key UNIQUE (organization_id, id),
  ADD CONSTRAINT owner_contacts_owner_id_key UNIQUE (owner_id, id);
ALTER TABLE followups ADD CONSTRAINT followups_id_animal_key UNIQUE (id, animal_id);
ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_org_id_key UNIQUE (organization_id, id);

-- Contacts d'un suivi (cahier des charges §6) ----------------------------------------

CREATE TABLE followup_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  followup_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  -- Numéro WhatsApp utilisé pour ce suivi.
  owner_contact_id uuid NOT NULL,
  role followup_contact_role NOT NULL,
  -- Le second contact n'est actif que si le vétérinaire l'active.
  active boolean NOT NULL DEFAULT true,
  -- Langue détectée, corrigeable par le vétérinaire (§5).
  language language NOT NULL DEFAULT 'fr',
  -- A quitté le groupe sans arrêter le suivi (§6).
  left_group_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (role = 'secondary' OR active),
  UNIQUE (organization_id, id),
  UNIQUE (followup_id, id),
  UNIQUE (followup_id, role),
  UNIQUE (followup_id, owner_id),
  FOREIGN KEY (organization_id, followup_id) REFERENCES followups (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, owner_id) REFERENCES owners (organization_id, id),
  FOREIGN KEY (organization_id, owner_contact_id) REFERENCES owner_contacts (organization_id, id),
  FOREIGN KEY (owner_id, owner_contact_id) REFERENCES owner_contacts (owner_id, id)
);

-- Historique des statuts (ajout seul), écrit par la base à chaque changement --------------

CREATE TABLE followup_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  followup_id uuid NOT NULL,
  from_status followup_status,
  to_status followup_status NOT NULL,
  -- NULL : changement fait par le système (Numa, tâche planifiée).
  actor_membership_id uuid,
  -- Motif technique (ex. owner_stop, control_date_reached), jamais de texte libre.
  reason text CHECK (reason ~ '^[a-z_]{2,48}$'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, followup_id) REFERENCES followups (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, actor_membership_id) REFERENCES memberships (organization_id, id)
);
CREATE INDEX followup_status_events_followup_idx ON followup_status_events (followup_id, occurred_at);

-- Suivis existants : leur statut actuel ouvre leur historique.
INSERT INTO followup_status_events (organization_id, followup_id, from_status, to_status, reason, occurred_at)
SELECT organization_id, id, NULL, status, 'history_start', created_at FROM followups;

-- Le motif vient de set_config('app.status_reason', …, true) dans la transaction.
CREATE FUNCTION app.record_followup_status() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  DECLARE
    reason text := NULLIF(current_setting('app.status_reason', true), '');
  BEGIN
    IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NEW;
    END IF;
    INSERT INTO followup_status_events (organization_id, followup_id, from_status, to_status, actor_membership_id, reason)
    VALUES (
      NEW.organization_id,
      NEW.id,
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END,
      NEW.status,
      (SELECT m.id FROM memberships m
        WHERE m.organization_id = NEW.organization_id AND m.user_id = app.current_user_id()),
      reason
    );
    RETURN NEW;
  END $$;
CREATE TRIGGER followups_status_history AFTER INSERT OR UPDATE OF status ON followups
  FOR EACH ROW EXECUTE FUNCTION app.record_followup_status();

-- Conversations ------------------------------------------------------------------------

CREATE TABLE conversation_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  followup_id uuid NOT NULL,
  kind thread_kind NOT NULL,
  -- Conversation directe : le contact ; groupe : NULL.
  followup_contact_id uuid,
  -- Identifiant chez le prestataire WhatsApp (simulé en phase 2).
  external_ref text CHECK (length(external_ref) BETWEEN 1 AND 200),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  CHECK ((kind = 'direct') = (followup_contact_id IS NOT NULL)),
  UNIQUE (organization_id, id),
  UNIQUE (followup_id, id),
  UNIQUE (followup_id, followup_contact_id),
  UNIQUE (organization_id, external_ref),
  FOREIGN KEY (organization_id, followup_id) REFERENCES followups (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (followup_id, followup_contact_id) REFERENCES followup_contacts (followup_id, id)
);
-- Un seul groupe ouvert par suivi.
CREATE UNIQUE INDEX conversation_threads_open_group_key ON conversation_threads (followup_id)
  WHERE kind = 'group' AND closed_at IS NULL;

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  followup_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  direction message_direction NOT NULL,
  author message_author NOT NULL,
  -- Propriétaire auteur (entrant) ou destinataire (sortant direct).
  followup_contact_id uuid,
  -- Vétérinaire auteur d'un message écrit depuis Stivea Vet.
  author_membership_id uuid,
  -- Contenu clinique : jamais journalisé, jamais montré sans `clinical.read`.
  body text NOT NULL DEFAULT '' CHECK (length(body) <= 4096),
  language language,
  -- État d'envoi, pour les seuls messages sortants.
  delivery_status message_delivery,
  -- Clé d'idempotence des envois : aucun doublon même si l'envoi est rejoué.
  idempotency_key text CHECK (idempotency_key ~ '^[A-Za-z0-9:._-]{8,200}$'),
  external_ref text CHECK (length(external_ref) BETWEEN 1 AND 200),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  error_code text CHECK (error_code ~ '^[a-z_]{2,64}$'),
  CHECK (
    (author = 'owner' AND direction = 'inbound' AND followup_contact_id IS NOT NULL)
    OR (author = 'numa' AND direction = 'outbound')
    OR (author = 'vet' AND direction = 'outbound' AND author_membership_id IS NOT NULL)
    OR (author = 'system' AND direction = 'internal')
  ),
  CHECK ((author = 'vet') = (author_membership_id IS NOT NULL)),
  CHECK ((direction = 'outbound') = (delivery_status IS NOT NULL)),
  CHECK ((direction = 'outbound') = (idempotency_key IS NOT NULL)),
  UNIQUE (organization_id, id),
  UNIQUE (followup_id, id),
  UNIQUE (organization_id, idempotency_key),
  UNIQUE (organization_id, external_ref),
  FOREIGN KEY (organization_id, followup_id) REFERENCES followups (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (followup_id, thread_id) REFERENCES conversation_threads (followup_id, id) ON DELETE CASCADE,
  FOREIGN KEY (followup_id, followup_contact_id) REFERENCES followup_contacts (followup_id, id),
  FOREIGN KEY (organization_id, author_membership_id) REFERENCES memberships (organization_id, id)
);
CREATE INDEX messages_thread_time_idx ON messages (thread_id, occurred_at);
CREATE INDEX messages_followup_time_idx ON messages (followup_id, occurred_at);

-- Consentements (ajout seul : chaque accord, retrait ou relance est une nouvelle ligne) ---

CREATE TABLE consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  followup_id uuid NOT NULL,
  followup_contact_id uuid NOT NULL,
  state consent_state NOT NULL,
  -- Version du texte de demande d'accord montré au propriétaire.
  wording_version text NOT NULL CHECK (wording_version ~ '^[0-9a-z.-]{1,40}$'),
  -- L'existence d'un groupe partagé a été expliquée avant l'accord (§6).
  group_explained boolean NOT NULL DEFAULT false,
  -- Message du propriétaire qui porte l'accord ou le retrait (OUI, STOP, REPRENDRE).
  message_id uuid,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, followup_id) REFERENCES followups (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (followup_id, followup_contact_id) REFERENCES followup_contacts (followup_id, id) ON DELETE CASCADE,
  FOREIGN KEY (followup_id, message_id) REFERENCES messages (followup_id, id) ON DELETE CASCADE
);
CREATE INDEX consents_contact_time_idx ON consents (followup_contact_id, recorded_at DESC);

-- Pièces jointes (architecture §7) : la base ne garde que la clé de l'objet, jamais d'URL --

CREATE TABLE attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  -- NULL seulement pour une capture d'agenda, rattachée au cabinet.
  followup_id uuid,
  message_id uuid,
  kind attachment_kind NOT NULL,
  -- Clé dans le stockage objet privé (jamais une URL publique).
  storage_key text NOT NULL CHECK (storage_key ~ '^[a-z0-9][a-z0-9/_.-]{7,254}$'),
  content_type text NOT NULL CHECK (content_type ~ '^(image|audio|application)/[a-z0-9.+-]{1,60}$'),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 104857600),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  -- Date au plus tard de suppression du fichier (conservation, motif).
  retention_until timestamptz NOT NULL,
  -- Fichier effacé du stockage ; la ligne reste pour la traçabilité.
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'agenda_capture') = (followup_id IS NULL)),
  CHECK (kind <> 'agenda_capture' OR message_id IS NULL),
  -- Une capture d'agenda est supprimée dès l'extraction, et au plus tard le lendemain.
  CHECK (kind <> 'agenda_capture' OR retention_until <= created_at + interval '1 day'),
  -- Suivi de 90 jours au plus, puis un an de conservation au plus.
  CHECK (retention_until <= created_at + interval '15 months'),
  UNIQUE (organization_id, id),
  UNIQUE (followup_id, id),
  UNIQUE (organization_id, storage_key),
  FOREIGN KEY (organization_id, followup_id) REFERENCES followups (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (followup_id, message_id) REFERENCES messages (followup_id, id) ON DELETE CASCADE
);
CREATE INDEX attachments_message_idx ON attachments (message_id) WHERE message_id IS NOT NULL;
CREATE INDEX attachments_retention_idx ON attachments (retention_until) WHERE deleted_at IS NULL;

CREATE TABLE voice_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  followup_id uuid NOT NULL,
  attachment_id uuid NOT NULL UNIQUE,
  -- Contenu clinique : même protection que les messages.
  text text NOT NULL CHECK (length(text) <= 10000),
  language language,
  -- Moteur de transcription : simulé tant qu'aucun fournisseur n'est validé (ADR 0004).
  engine text NOT NULL DEFAULT 'simulated' CHECK (engine = 'simulated'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, followup_id) REFERENCES followups (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (followup_id, attachment_id) REFERENCES attachments (followup_id, id) ON DELETE CASCADE
);

-- Une transcription ne porte que sur un message vocal.
CREATE FUNCTION app.check_voice_attachment() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM attachments a WHERE a.id = NEW.attachment_id AND a.kind = 'voice') THEN
      RAISE EXCEPTION 'une transcription porte sur un message vocal' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END $$;
CREATE TRIGGER voice_transcripts_voice_only BEFORE INSERT OR UPDATE ON voice_transcripts
  FOR EACH ROW EXECUTE FUNCTION app.check_voice_attachment();

-- Triage et alertes (cahier des charges §7) ----------------------------------------------

CREATE TABLE triage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  followup_id uuid NOT NULL,
  -- Message du propriétaire qui a déclenché l'évaluation, s'il y en a un.
  message_id uuid,
  level triage_level NOT NULL,
  source triage_source NOT NULL,
  -- Signe d'alerte du protocole reconnu par une règle déterministe.
  alert_rule_id uuid,
  -- Explication courte, réservée aux personnes autorisées aux données cliniques.
  reason text NOT NULL CHECK (length(reason) BETWEEN 2 AND 300),
  created_by_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((source = 'vet') = (created_by_membership_id IS NOT NULL)),
  UNIQUE (organization_id, id),
  UNIQUE (followup_id, id),
  FOREIGN KEY (organization_id, followup_id) REFERENCES followups (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (followup_id, message_id) REFERENCES messages (followup_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, alert_rule_id) REFERENCES alert_rules (organization_id, id),
  FOREIGN KEY (organization_id, created_by_membership_id) REFERENCES memberships (organization_id, id)
);
CREATE INDEX triage_events_followup_time_idx ON triage_events (followup_id, created_at DESC);

CREATE TABLE alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  followup_id uuid NOT NULL,
  triage_event_id uuid NOT NULL,
  level alert_level NOT NULL,
  status alert_status NOT NULL DEFAULT 'open',
  -- Vétérinaire responsable ou de garde, prévenu en premier.
  target_membership_id uuid NOT NULL,
  -- Urgence seulement : sans accusé de réception, escalade aux autres vétérinaires à cette heure.
  escalate_at timestamptz,
  escalated_at timestamptz,
  resolved_at timestamptz,
  resolved_by_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((level = 'urgent') = (escalate_at IS NOT NULL)),
  CHECK (escalate_at IS NULL OR escalate_at BETWEEN created_at + interval '3 hours' AND created_at + interval '5 hours'),
  CHECK (status <> 'escalated' OR escalated_at IS NOT NULL),
  CHECK ((status = 'resolved') = (resolved_at IS NOT NULL)),
  CHECK ((resolved_at IS NULL) = (resolved_by_membership_id IS NULL)),
  UNIQUE (organization_id, id),
  UNIQUE (triage_event_id),
  FOREIGN KEY (organization_id, followup_id) REFERENCES followups (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (followup_id, triage_event_id) REFERENCES triage_events (followup_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, target_membership_id) REFERENCES memberships (organization_id, id),
  FOREIGN KEY (organization_id, resolved_by_membership_id) REFERENCES memberships (organization_id, id)
);
CREATE INDEX alerts_open_idx ON alerts (organization_id, created_at DESC) WHERE status IN ('open', 'escalated');
CREATE INDEX alerts_escalation_idx ON alerts (escalate_at) WHERE status = 'open' AND escalate_at IS NOT NULL;

CREATE TABLE acknowledgements (
  organization_id uuid NOT NULL,
  alert_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (alert_id, membership_id),
  FOREIGN KEY (organization_id, alert_id) REFERENCES alerts (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, membership_id) REFERENCES memberships (organization_id, id)
);

-- Rendez-vous (cahier des charges §8) ----------------------------------------------------

CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  followup_id uuid,
  animal_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  kind appointment_kind NOT NULL,
  status appointment_status NOT NULL DEFAULT 'proposed',
  source appointment_source NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  confirmed_by_membership_id uuid,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  -- Identifiant dans l'agenda dr.veto (phase 3).
  external_ref text CHECK (length(external_ref) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at AND ends_at - starts_at <= interval '4 hours'),
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  CHECK (status <> 'confirmed' OR confirmed_at IS NOT NULL),
  -- Un rendez-vous confirmé dans Stivea Vet l'est par une personne identifiée.
  CHECK (source = 'drveto' OR (confirmed_at IS NULL) = (confirmed_by_membership_id IS NULL)),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, external_ref),
  FOREIGN KEY (organization_id, animal_id) REFERENCES animals (organization_id, id),
  FOREIGN KEY (organization_id, followup_id) REFERENCES followups (organization_id, id) ON DELETE SET NULL (followup_id),
  FOREIGN KEY (followup_id, animal_id) REFERENCES followups (id, animal_id),
  FOREIGN KEY (organization_id, membership_id) REFERENCES memberships (organization_id, id),
  FOREIGN KEY (organization_id, confirmed_by_membership_id) REFERENCES memberships (organization_id, id)
);
CREATE INDEX appointments_vet_time_idx ON appointments (organization_id, membership_id, starts_at)
  WHERE status <> 'cancelled';

-- Tâches et fiabilité (architecture §9) ---------------------------------------------------

-- Événements écrits dans la même transaction que le changement métier, puis publiés.
CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  topic text NOT NULL CHECK (topic ~ '^[a-z_]+\.[a-z_]+$'),
  aggregate_type text NOT NULL CHECK (aggregate_type ~ '^[a-z_]{2,40}$'),
  aggregate_id uuid NOT NULL,
  -- Identifiants et codes seulement : jamais de contenu clinique, numéro ou e-mail.
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object' AND pg_column_size(payload) <= 2048),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (organization_id, id)
);
CREATE INDEX outbox_events_unpublished_idx ON outbox_events (created_at) WHERE published_at IS NULL;

CREATE TABLE scheduled_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  kind text NOT NULL CHECK (kind ~ '^[a-z_]+\.[a-z_]+$'),
  followup_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object' AND pg_column_size(payload) <= 2048),
  -- Une même tâche n'est jamais inscrite deux fois.
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9:._-]{8,200}$'),
  status job_status NOT NULL DEFAULT 'pending',
  run_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  locked_by text CHECK (locked_by ~ '^[a-z0-9-]{1,64}$'),
  locked_until timestamptz,
  -- Code d'erreur technique seulement, jamais le message d'erreur brut.
  last_error_code text CHECK (last_error_code ~ '^[a-z_]{2,64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CHECK (attempts <= max_attempts),
  CHECK ((status = 'running') = (locked_until IS NOT NULL)),
  CHECK ((status = 'running') = (locked_by IS NOT NULL)),
  CHECK ((status IN ('succeeded', 'dead', 'cancelled')) = (finished_at IS NOT NULL)),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, followup_id) REFERENCES followups (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX scheduled_jobs_due_idx ON scheduled_jobs (run_at) WHERE status = 'pending';
CREATE INDEX scheduled_jobs_dead_idx ON scheduled_jobs (organization_id, finished_at DESC) WHERE status = 'dead';

CREATE TABLE job_attempts (
  organization_id uuid NOT NULL,
  job_id uuid NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number >= 1),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  outcome job_outcome,
  error_code text CHECK (error_code ~ '^[a-z_]{2,64}$'),
  CHECK ((outcome IS NULL) = (finished_at IS NULL)),
  CHECK (outcome = 'failed' OR error_code IS NULL),
  PRIMARY KEY (job_id, attempt_number),
  FOREIGN KEY (organization_id, job_id) REFERENCES scheduled_jobs (organization_id, id) ON DELETE CASCADE
);

-- Notifications à l'équipe (alerte WhatsApp, notification sur l'ordinateur, e-mail).
CREATE TABLE notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  channel delivery_channel NOT NULL,
  recipient_membership_id uuid NOT NULL,
  alert_id uuid,
  job_id uuid,
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9:._-]{8,200}$'),
  status delivery_status NOT NULL DEFAULT 'pending',
  external_ref text CHECK (length(external_ref) BETWEEN 1 AND 200),
  error_code text CHECK (error_code ~ '^[a-z_]{2,64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  failed_at timestamptz,
  CHECK ((status = 'failed') = (failed_at IS NOT NULL)),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, recipient_membership_id) REFERENCES memberships (organization_id, id),
  FOREIGN KEY (organization_id, alert_id) REFERENCES alerts (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, job_id) REFERENCES scheduled_jobs (organization_id, id) ON DELETE SET NULL (job_id)
);
CREATE INDEX notification_deliveries_alert_idx ON notification_deliveries (alert_id) WHERE alert_id IS NOT NULL;

-- Ajout seul et horodatage --------------------------------------------------------------

CREATE TRIGGER followup_status_events_append_only BEFORE UPDATE ON followup_status_events
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER consents_append_only BEFORE UPDATE ON consents
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER triage_events_append_only BEFORE UPDATE ON triage_events
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER acknowledgements_append_only BEFORE UPDATE ON acknowledgements
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();

CREATE TRIGGER followup_contacts_touch BEFORE UPDATE ON followup_contacts FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER appointments_touch BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER scheduled_jobs_touch BEFORE UPDATE ON scheduled_jobs FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

REVOKE ALL ON FUNCTION app.record_followup_status(), app.check_voice_attachment() FROM PUBLIC;

-- Isolation des cabinets ------------------------------------------------------------------

DO $$
DECLARE
  tenant_table text;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY[
    'followup_contacts', 'followup_status_events', 'consents', 'conversation_threads',
    'messages', 'attachments', 'voice_transcripts', 'triage_events', 'alerts',
    'acknowledgements', 'appointments', 'outbox_events', 'scheduled_jobs', 'job_attempts',
    'notification_deliveries'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = app.current_organization_id()) WITH CHECK (organization_id = app.current_organization_id())',
      tenant_table
    );
  END LOOP;
END $$;

-- Droits du rôle applicatif ---------------------------------------------------------------
-- Aucune suppression directe : l'effacement passe par la suppression du suivi (cascade)
-- ou par le marquage des fichiers effacés. Les historiques ne sont jamais modifiables.

GRANT SELECT, INSERT, UPDATE (active, language, left_group_at) ON followup_contacts TO stivea_app;
GRANT SELECT, INSERT ON followup_status_events, consents, triage_events, acknowledgements TO stivea_app;
GRANT SELECT, INSERT, UPDATE (external_ref, closed_at) ON conversation_threads TO stivea_app;
GRANT SELECT, INSERT, UPDATE (delivery_status, external_ref, sent_at, delivered_at, read_at, failed_at, error_code)
  ON messages TO stivea_app;
GRANT SELECT, INSERT, UPDATE (deleted_at) ON attachments TO stivea_app;
GRANT SELECT, INSERT ON voice_transcripts TO stivea_app;
GRANT SELECT, INSERT, UPDATE (status, escalated_at, resolved_at, resolved_by_membership_id) ON alerts TO stivea_app;
GRANT SELECT, INSERT, UPDATE (status, starts_at, ends_at, membership_id, confirmed_by_membership_id, confirmed_at, cancelled_at, external_ref)
  ON appointments TO stivea_app;
GRANT SELECT, INSERT, UPDATE (published_at) ON outbox_events TO stivea_app;
GRANT SELECT, INSERT, UPDATE (status, run_at, attempts, locked_by, locked_until, last_error_code, finished_at)
  ON scheduled_jobs TO stivea_app;
GRANT SELECT, INSERT, UPDATE (finished_at, outcome, error_code) ON job_attempts TO stivea_app;
GRANT SELECT, INSERT, UPDATE (status, external_ref, error_code, sent_at, failed_at) ON notification_deliveries TO stivea_app;
