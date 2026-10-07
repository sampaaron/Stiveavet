-- 0005 : installation guidée, réglages de Numa, urgences, horaires et garde.
--
-- Cahier des charges §3, §7 et §16 : horaires d'envoi, consignes d'urgence distinctes pour
-- la journée, la nuit, le week-end et les jours fériés, contacts d'urgence, planning de garde,
-- délai d'escalade réglable entre 3 et 5 heures. WhatsApp, dr.veto et le mandat de prélèvement
-- ne sont que simulés (ADR 0004) : la base refuse toute connexion « réelle » à ce stade.

CREATE TYPE emergency_period AS ENUM ('day', 'night', 'weekend', 'holiday');
CREATE TYPE availability_kind AS ENUM ('messages', 'appointments');
CREATE TYPE integration_provider AS ENUM ('whatsapp', 'drveto', 'payment_mandate');
CREATE TYPE onboarding_step AS ENUM (
  'organization', 'whatsapp', 'drveto', 'rules', 'team', 'protocols', 'billing', 'test_followup'
);

CREATE TABLE organization_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations (id),
  timezone text NOT NULL DEFAULT 'Europe/Paris' CHECK (timezone = 'Europe/Paris'),
  -- Sans accusé de réception, alerte des autres vétérinaires après ce délai (3 à 5 h).
  escalation_delay_minutes integer NOT NULL DEFAULT 240 CHECK (escalation_delay_minutes BETWEEN 180 AND 300),
  -- Analyse de photo assistée : désactivée par défaut (cahier des charges §5).
  photo_analysis_enabled boolean NOT NULL DEFAULT false,
  updated_by_membership_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, updated_by_membership_id) REFERENCES memberships (organization_id, id)
);

-- Plages hebdomadaires : envoi des messages programmés, et créneaux de rendez-vous approuvés.
CREATE TABLE availability_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  kind availability_kind NOT NULL,
  -- 1 = lundi … 7 = dimanche (ISO 8601).
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  CHECK (ends_at > starts_at),
  UNIQUE (organization_id, kind, weekday, starts_at)
);

CREATE TABLE emergency_instructions (
  organization_id uuid NOT NULL REFERENCES organizations (id),
  period emergency_period NOT NULL,
  instructions text NOT NULL CHECK (length(instructions) BETWEEN 10 AND 1500),
  updated_by_membership_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, period),
  FOREIGN KEY (organization_id, updated_by_membership_id) REFERENCES memberships (organization_id, id)
);

-- Coordonnées transmises au propriétaire en cas d'urgence (numéros du cabinet, de garde).
CREATE TABLE emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  label text NOT NULL CHECK (length(label) BETWEEN 2 AND 80),
  phone text NOT NULL CHECK (phone ~ '^\+?[0-9][0-9 .]{5,19}$'),
  position integer NOT NULL CHECK (position >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);

CREATE TABLE on_call_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  membership_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at AND ends_at - starts_at <= interval '14 days'),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, membership_id) REFERENCES memberships (organization_id, id),
  FOREIGN KEY (organization_id, created_by_membership_id) REFERENCES memberships (organization_id, id)
);
CREATE INDEX on_call_schedules_period_idx ON on_call_schedules (organization_id, starts_at, ends_at);

-- Seul un vétérinaire actif peut être de garde.
CREATE FUNCTION app.check_on_call_vet() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = NEW.membership_id AND m.role IN ('admin_vet', 'vet') AND m.deactivated_at IS NULL
    ) THEN
      RAISE EXCEPTION 'seul un vétérinaire actif peut être de garde' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END $$;
CREATE TRIGGER on_call_schedules_vet BEFORE INSERT OR UPDATE ON on_call_schedules
  FOR EACH ROW EXECUTE FUNCTION app.check_on_call_vet();

-- Connexions externes : uniquement simulées tant qu'aucun prestataire n'est décidé (ADR 0004).
CREATE TABLE integration_connections (
  organization_id uuid NOT NULL REFERENCES organizations (id),
  provider integration_provider NOT NULL,
  mode text NOT NULL DEFAULT 'simulated' CHECK (mode = 'simulated'),
  -- Libellé affichable, déjà masqué (jamais de numéro complet ni d'IBAN).
  display_label text NOT NULL CHECK (length(display_label) BETWEEN 2 AND 120),
  connected_by_membership_id uuid NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, provider),
  FOREIGN KEY (organization_id, connected_by_membership_id) REFERENCES memberships (organization_id, id)
);

CREATE TABLE onboarding_steps (
  organization_id uuid NOT NULL REFERENCES organizations (id),
  step onboarding_step NOT NULL,
  completed_by_membership_id uuid NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, step),
  FOREIGN KEY (organization_id, completed_by_membership_id) REFERENCES memberships (organization_id, id)
);

-- Un suivi test (installation) n'est jamais compté ni facturé et n'envoie rien.
ALTER TABLE followups ADD COLUMN is_test boolean NOT NULL DEFAULT false;

CREATE TRIGGER organization_settings_touch BEFORE UPDATE ON organization_settings
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER emergency_instructions_touch BEFORE UPDATE ON emergency_instructions
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

DO $$
DECLARE
  tenant_table text;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY[
    'organization_settings', 'availability_windows', 'emergency_instructions',
    'emergency_contacts', 'on_call_schedules', 'integration_connections', 'onboarding_steps'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = app.current_organization_id()) WITH CHECK (organization_id = app.current_organization_id())',
      tenant_table
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON organization_settings, emergency_instructions TO stivea_app;
GRANT SELECT, INSERT, DELETE ON availability_windows, emergency_contacts, on_call_schedules TO stivea_app;
GRANT SELECT, INSERT, DELETE ON integration_connections TO stivea_app;
GRANT SELECT, INSERT ON onboarding_steps TO stivea_app;

REVOKE ALL ON FUNCTION app.check_on_call_vet() FROM PUBLIC;
