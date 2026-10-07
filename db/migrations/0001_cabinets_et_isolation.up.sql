-- 0001 : cabinets, personnes, animaux, propriétaires, suivis, audit.
-- Règle : chaque table métier porte organization_id, protégée par RLS forcée.
-- Le rôle applicatif stivea_app ne voit que le cabinet défini par
-- set_config('app.organization_id', …, true) dans sa transaction.

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO stivea_app;

CREATE SCHEMA app;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO stivea_app;

-- Cabinet courant de la transaction ; NULL si aucun n'est défini (aucune ligne visible).
CREATE FUNCTION app.current_organization_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.organization_id', true), '')::uuid $$;

-- Personne authentifiée de la transaction ; NULL si aucune.
CREATE FUNCTION app.current_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

CREATE FUNCTION app.touch_updated_at() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE FUNCTION app.forbid_change() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN RAISE EXCEPTION '% est en ajout seul', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege'; END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_organization_id(), app.current_user_id() TO stivea_app;

CREATE TYPE member_role AS ENUM ('admin_vet', 'vet', 'assistant');
CREATE TYPE species AS ENUM ('dog', 'cat');
CREATE TYPE language AS ENUM ('fr', 'en');
CREATE TYPE contact_kind AS ENUM ('whatsapp', 'email');
CREATE TYPE followup_status AS ENUM ('draft', 'active', 'paused', 'human_takeover', 'ended');
CREATE TYPE triage_level AS ENUM ('normal', 'watch', 'urgent');

-- Cabinets --------------------------------------------------------------------

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Personnes (globales : une personne peut appartenir à plusieurs cabinets) ----

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (email = lower(email) AND email LIKE '%_@_%'),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (email);

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  user_id uuid NOT NULL REFERENCES users (id),
  role member_role NOT NULL,
  deactivated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id),
  UNIQUE (organization_id, id)
);
CREATE INDEX memberships_user_id_idx ON memberships (user_id);

-- Animaux et propriétaires ------------------------------------------------------

CREATE TABLE animals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  species species NOT NULL,
  breed text,
  birth_date date,
  weight_grams integer CHECK (weight_grams > 0),
  -- Identifiant de l'animal dans dr.veto (import en lecture seule, phase 3).
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, external_ref)
);

CREATE TABLE owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  full_name text NOT NULL CHECK (length(full_name) BETWEEN 1 AND 160),
  preferred_language language NOT NULL DEFAULT 'fr',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);

CREATE TABLE owner_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  kind contact_kind NOT NULL,
  value text NOT NULL CHECK (length(value) BETWEEN 3 AND 254),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, owner_id) REFERENCES owners (organization_id, id) ON DELETE CASCADE,
  UNIQUE (organization_id, owner_id, kind, value)
);

CREATE TABLE animal_owners (
  organization_id uuid NOT NULL,
  animal_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (animal_id, owner_id),
  FOREIGN KEY (organization_id, animal_id) REFERENCES animals (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, owner_id) REFERENCES owners (organization_id, id) ON DELETE CASCADE
);

-- Suivis -------------------------------------------------------------------------

CREATE TABLE followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  animal_id uuid NOT NULL,
  responsible_membership_id uuid NOT NULL,
  procedure text NOT NULL CHECK (length(procedure) BETWEEN 1 AND 160),
  procedure_at timestamptz NOT NULL,
  status followup_status NOT NULL DEFAULT 'draft',
  triage triage_level NOT NULL DEFAULT 'normal',
  is_private boolean NOT NULL DEFAULT false,
  control_appointment_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, animal_id) REFERENCES animals (organization_id, id),
  FOREIGN KEY (organization_id, responsible_membership_id) REFERENCES memberships (organization_id, id),
  CHECK (ended_at IS NULL OR status = 'ended')
);
CREATE INDEX followups_active_idx ON followups (organization_id, status) WHERE status <> 'ended';

-- Partage explicite d'un suivi avec un confrère (dossier privé, absence…).
CREATE TABLE followup_shares (
  organization_id uuid NOT NULL,
  followup_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  granted_by_membership_id uuid NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (followup_id, membership_id),
  FOREIGN KEY (organization_id, followup_id) REFERENCES followups (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, membership_id) REFERENCES memberships (organization_id, id),
  FOREIGN KEY (organization_id, granted_by_membership_id) REFERENCES memberships (organization_id, id)
);

-- Journal d'activité (ajout seul) ----------------------------------------------

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  actor_membership_id uuid,
  action text NOT NULL CHECK (action ~ '^[a-z_]+\.[a-z_]+$'),
  target_type text,
  target_id uuid,
  -- Métadonnées techniques uniquement : jamais de contenu clinique, numéro ou message.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, actor_membership_id) REFERENCES memberships (organization_id, id)
);
CREATE INDEX audit_events_org_time_idx ON audit_events (organization_id, occurred_at DESC);
CREATE TRIGGER audit_events_append_only BEFORE UPDATE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();

-- Horodatage des mises à jour ---------------------------------------------------

CREATE TRIGGER organizations_touch BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER users_touch BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER memberships_touch BEFORE UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER animals_touch BEFORE UPDATE ON animals FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER owners_touch BEFORE UPDATE ON owners FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER followups_touch BEFORE UPDATE ON followups FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- Isolation des cabinets (RLS forcée, y compris pour le propriétaire des tables) --

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_isolation ON organizations
  USING (id = app.current_organization_id())
  WITH CHECK (id = app.current_organization_id());

-- Une personne n'est visible que d'elle-même ou des cabinets dont elle est membre.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY user_visibility ON users
  USING (
    id = app.current_user_id()
    OR EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id = users.id AND m.organization_id = app.current_organization_id()
    )
  )
  WITH CHECK (id = app.current_user_id());

DO $$
DECLARE
  tenant_table text;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY[
    'memberships', 'animals', 'owners', 'owner_contacts', 'animal_owners',
    'followups', 'followup_shares', 'audit_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = app.current_organization_id()) WITH CHECK (organization_id = app.current_organization_id())',
      tenant_table
    );
  END LOOP;
END $$;

-- Droits du rôle applicatif ---------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON organizations, users, memberships TO stivea_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON animals, owners, owner_contacts, animal_owners, followups, followup_shares TO stivea_app;
-- Le journal d'activité n'est ni modifiable ni effaçable par l'application.
GRANT SELECT, INSERT ON audit_events TO stivea_app;
