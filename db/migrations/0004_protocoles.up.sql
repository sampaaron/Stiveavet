-- 0004 : protocoles de suivi, versions immuables, étapes et signes d'alerte.
--
-- Un protocole est une suite de versions. Une version ne change plus jamais une fois écrite
-- (contrôle en base) : modifier un protocole crée une nouvelle version, et un suivi lancé garde
-- la version avec laquelle il a été lancé (cahier des charges §9).

CREATE TYPE protocol_category AS ENUM ('surgery', 'dental', 'treatment', 'other');
CREATE TYPE protocol_species AS ENUM ('dog', 'cat', 'both');
CREATE TYPE protocol_step_kind AS ENUM ('message', 'question', 'photo_request', 'reminder', 'control');
CREATE TYPE alert_level AS ENUM ('watch', 'urgent');

-- Nouvelle permission : un vétérinaire crée, duplique et modifie ses propres protocoles
-- (cahier des charges §9) ; les protocoles du cabinet restent sous `protocols.manage`.
-- RLS forcée y compris pour le propriétaire : levée le temps de cette transaction seulement.
ALTER TABLE permissions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE role_permissions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE membership_permissions NO FORCE ROW LEVEL SECURITY;
INSERT INTO permissions (key, label, clinical) VALUES
  ('protocols.create_own', 'Créer et modifier ses propres protocoles', false);
INSERT INTO role_permissions (role, permission, is_default) VALUES
  ('admin_vet', 'protocols.create_own', true),
  ('vet', 'protocols.create_own', true);
INSERT INTO membership_permissions (organization_id, membership_id, permission)
SELECT m.organization_id, m.id, 'protocols.create_own'
FROM memberships m WHERE m.role IN ('admin_vet', 'vet');
ALTER TABLE permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE membership_permissions FORCE ROW LEVEL SECURITY;

CREATE TABLE protocols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  -- NULL : protocole du cabinet ; sinon protocole personnel de ce membre.
  owner_membership_id uuid,
  -- Modèle de la bibliothèque de départ dont il est issu (une seule copie par cabinet).
  library_key text CHECK (library_key ~ '^[a-z0-9-]{1,64}$'),
  duplicated_from_version_id uuid,
  current_version_id uuid,
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, library_key),
  FOREIGN KEY (organization_id, owner_membership_id) REFERENCES memberships (organization_id, id),
  FOREIGN KEY (organization_id, created_by_membership_id) REFERENCES memberships (organization_id, id)
);

CREATE TABLE protocol_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  protocol_id uuid NOT NULL,
  version_number integer NOT NULL CHECK (version_number >= 1),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  category protocol_category NOT NULL,
  species protocol_species NOT NULL,
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  duration_days integer NOT NULL CHECK (duration_days BETWEEN 1 AND 90),
  change_note text NOT NULL DEFAULT '' CHECK (length(change_note) <= 500),
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Validation par un vétérinaire : seule écriture permise après création, une seule fois.
  validated_by_membership_id uuid,
  validated_at timestamptz,
  CHECK ((validated_by_membership_id IS NULL) = (validated_at IS NULL)),
  UNIQUE (organization_id, id),
  UNIQUE (protocol_id, id),
  UNIQUE (protocol_id, version_number),
  FOREIGN KEY (organization_id, protocol_id) REFERENCES protocols (organization_id, id),
  FOREIGN KEY (organization_id, created_by_membership_id) REFERENCES memberships (organization_id, id),
  FOREIGN KEY (organization_id, validated_by_membership_id) REFERENCES memberships (organization_id, id)
);

-- La version courante appartient forcément au protocole.
ALTER TABLE protocols
  ADD FOREIGN KEY (id, current_version_id) REFERENCES protocol_versions (protocol_id, id),
  ADD FOREIGN KEY (organization_id, duplicated_from_version_id) REFERENCES protocol_versions (organization_id, id);

CREATE TABLE protocol_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  protocol_version_id uuid NOT NULL,
  position integer NOT NULL CHECK (position >= 1),
  -- Délai après l'intervention ou le début du suivi, en heures.
  offset_hours integer NOT NULL CHECK (offset_hours BETWEEN 0 AND 2160),
  kind protocol_step_kind NOT NULL,
  content text NOT NULL CHECK (length(content) BETWEEN 2 AND 1000),
  UNIQUE (protocol_version_id, position),
  FOREIGN KEY (organization_id, protocol_version_id) REFERENCES protocol_versions (organization_id, id)
);

CREATE TABLE alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  protocol_version_id uuid NOT NULL,
  position integer NOT NULL CHECK (position >= 1),
  level alert_level NOT NULL,
  description text NOT NULL CHECK (length(description) BETWEEN 2 AND 300),
  UNIQUE (protocol_version_id, position),
  FOREIGN KEY (organization_id, protocol_version_id) REFERENCES protocol_versions (organization_id, id)
);

-- Un suivi garde la version de protocole avec laquelle il a été lancé.
ALTER TABLE followups ADD COLUMN protocol_version_id uuid;
ALTER TABLE followups
  ADD FOREIGN KEY (organization_id, protocol_version_id) REFERENCES protocol_versions (organization_id, id);

-- Immuabilité -----------------------------------------------------------------------

-- app.forbid_change() (migration 0001) refuse toute modification.
CREATE TRIGGER protocol_steps_immutable BEFORE UPDATE OR DELETE ON protocol_steps
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER alert_rules_immutable BEFORE UPDATE OR DELETE ON alert_rules
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER protocol_versions_no_delete BEFORE DELETE ON protocol_versions
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();

-- Une version ne change plus, sauf sa validation, posée une seule fois.
CREATE FUNCTION app.protocol_version_validation_only() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF OLD.validated_at IS NOT NULL
       OR NEW.validated_at IS NULL
       OR (NEW.id, NEW.organization_id, NEW.protocol_id, NEW.version_number, NEW.name, NEW.category,
           NEW.species, NEW.description, NEW.duration_days, NEW.change_note,
           NEW.created_by_membership_id, NEW.created_at)
          IS DISTINCT FROM
          (OLD.id, OLD.organization_id, OLD.protocol_id, OLD.version_number, OLD.name, OLD.category,
           OLD.species, OLD.description, OLD.duration_days, OLD.change_note,
           OLD.created_by_membership_id, OLD.created_at) THEN
      RAISE EXCEPTION 'protocol_versions : contenu immuable' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END $$;
CREATE TRIGGER protocol_versions_immutable BEFORE UPDATE ON protocol_versions
  FOR EACH ROW EXECUTE FUNCTION app.protocol_version_validation_only();

-- Un protocole ne change ni de cabinet, ni de propriétaire, ni d'origine.
CREATE FUNCTION app.protocol_identity_fixed() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF (NEW.id, NEW.organization_id, NEW.owner_membership_id, NEW.library_key,
        NEW.duplicated_from_version_id, NEW.created_by_membership_id, NEW.created_at)
       IS DISTINCT FROM
       (OLD.id, OLD.organization_id, OLD.owner_membership_id, OLD.library_key,
        OLD.duplicated_from_version_id, OLD.created_by_membership_id, OLD.created_at) THEN
      RAISE EXCEPTION 'protocols : identité immuable' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END $$;
CREATE TRIGGER protocols_identity_fixed BEFORE UPDATE ON protocols
  FOR EACH ROW EXECUTE FUNCTION app.protocol_identity_fixed();

-- Un suivi lancé ne change pas de version de protocole.
CREATE FUNCTION app.followup_protocol_fixed() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF OLD.status <> 'draft' AND NEW.protocol_version_id IS DISTINCT FROM OLD.protocol_version_id THEN
      RAISE EXCEPTION 'followups : protocole d''un suivi lancé immuable' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END $$;
CREATE TRIGGER followups_protocol_fixed BEFORE UPDATE OF protocol_version_id ON followups
  FOR EACH ROW EXECUTE FUNCTION app.followup_protocol_fixed();

REVOKE ALL ON FUNCTION app.protocol_version_validation_only(),
  app.protocol_identity_fixed(), app.followup_protocol_fixed() FROM PUBLIC;

-- Isolation et droits ---------------------------------------------------------------

DO $$
DECLARE
  tenant_table text;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY['protocols', 'protocol_versions', 'protocol_steps', 'alert_rules'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = app.current_organization_id()) WITH CHECK (organization_id = app.current_organization_id())',
      tenant_table
    );
  END LOOP;
END $$;

-- Ni suppression ni modification de contenu pour l'application : seulement ajout,
-- archivage, version courante et validation.
GRANT SELECT, INSERT ON protocols, protocol_versions, protocol_steps, alert_rules TO stivea_app;
GRANT UPDATE (current_version_id, archived_at) ON protocols TO stivea_app;
GRANT UPDATE (validated_by_membership_id, validated_at) ON protocol_versions TO stivea_app;

CREATE INDEX protocol_versions_protocol_idx ON protocol_versions (protocol_id, version_number DESC);
CREATE INDEX followups_protocol_version_idx ON followups (protocol_version_id) WHERE protocol_version_id IS NOT NULL;
