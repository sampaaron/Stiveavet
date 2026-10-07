-- 0010 : lancement manuel d'un suivi (phase 2, lot 12).
--
-- Cahier des charges §4 et §5, architecture §6 et §11. Le vétérinaire importe en lecture seule
-- le résumé utile de dr.veto, ajuste une fiche de lancement propre au suivi (étapes, signes
-- d'alerte, traitements, premier message, contrôle) puis lance lui-même le suivi.
--   - L'import est figé : il garde ce que dr.veto disait au moment du lancement.
--   - Les étapes et les signes d'alerte du suivi partent de la version de protocole choisie,
--     elle-même figée au lancement ; une modification remplace les lignes futures, jamais les
--     passées (les lignes remplacées restent, marquées `superseded_at`).
--   - Un traitement importé n'est rappelé qu'une fois validé par un vétérinaire.
--   - Les changements de statut suivent un cycle de vie vérifié par la base.

-- Courtes listes de textes (allergies, antécédents), bornées par la base.
CREATE FUNCTION app.short_texts(items text[], max_items integer, max_length integer) RETURNS boolean
  LANGUAGE sql IMMUTABLE
  AS $$
    SELECT coalesce(cardinality(items), 0) <= max_items
      AND NOT EXISTS (
        SELECT 1 FROM unnest(items) AS item
        WHERE item IS NULL OR length(item) NOT BETWEEN 1 AND max_length
      )
  $$;

-- Suivis : premier message choisi par le vétérinaire et révision de la fiche --------------

ALTER TABLE followups
  ADD COLUMN first_contact_at timestamptz,
  ADD COLUMN plan_revision integer NOT NULL DEFAULT 0 CHECK (plan_revision >= 0);
UPDATE followups SET first_contact_at = coalesce(started_at, procedure_at) WHERE status <> 'draft';

-- Cycle de vie : brouillon → actif ; actif, en pause et reprise en main entre eux ; arrêt ;
-- réactivation d'un suivi terminé. Jamais de retour au brouillon. Le lancement exige une
-- version de protocole validée, une date de premier message et une date de début.
CREATE FUNCTION app.check_followup_transition() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF NEW.status = OLD.status THEN
      RETURN NEW;
    END IF;
    IF NOT (
      (OLD.status = 'draft' AND NEW.status = 'active')
      OR (OLD.status IN ('active', 'paused', 'human_takeover')
          AND NEW.status IN ('active', 'paused', 'human_takeover', 'ended'))
      OR (OLD.status = 'ended' AND NEW.status = 'active')
    ) THEN
      RAISE EXCEPTION 'followups : changement de statut interdit' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status = 'draft' AND (
      NEW.first_contact_at IS NULL
      OR NEW.started_at IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM protocol_versions v
        WHERE v.organization_id = NEW.organization_id
          AND v.id = NEW.protocol_version_id
          AND v.validated_at IS NOT NULL
      )
    ) THEN
      RAISE EXCEPTION 'followups : lancement incomplet' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END $$;
CREATE TRIGGER followups_status_transition BEFORE UPDATE OF status ON followups
  FOR EACH ROW EXECUTE FUNCTION app.check_followup_transition();

-- Import dr.veto (lecture seule, figé) ------------------------------------------------------

CREATE TABLE followup_imports (
  followup_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('drveto_simulated')),
  external_ref text NOT NULL CHECK (external_ref ~ '^[A-Za-z0-9-]{3,64}$'),
  allergies text[] NOT NULL DEFAULT '{}' CHECK (app.short_texts(allergies, 20, 200)),
  antecedents text[] NOT NULL DEFAULT '{}' CHECK (app.short_texts(antecedents, 20, 300)),
  imported_by_membership_id uuid NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, followup_id) REFERENCES followups (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, imported_by_membership_id) REFERENCES memberships (organization_id, id)
);
CREATE TRIGGER followup_imports_frozen BEFORE UPDATE ON followup_imports
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();

-- Traitements du suivi ----------------------------------------------------------------------

CREATE TYPE treatment_source AS ENUM ('drveto', 'vet');

CREATE TABLE followup_treatments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  followup_id uuid NOT NULL,
  source treatment_source NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  -- Posologie telle que prescrite par le vétérinaire ; Numa ne la modifie jamais.
  instructions text NOT NULL CHECK (length(instructions) BETWEEN 1 AND 300),
  validated_by_membership_id uuid,
  validated_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((validated_by_membership_id IS NULL) = (validated_at IS NULL)),
  -- Un traitement ajouté par le vétérinaire est validé dès sa saisie.
  CHECK (source = 'drveto' OR validated_at IS NOT NULL),
  UNIQUE (organization_id, id),
  UNIQUE (followup_id, id),
  FOREIGN KEY (organization_id, followup_id) REFERENCES followups (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, validated_by_membership_id) REFERENCES memberships (organization_id, id)
);
CREATE INDEX followup_treatments_followup_idx ON followup_treatments (followup_id) WHERE removed_at IS NULL;

-- Validation et retrait sont définitifs ; le contenu ne change pas (droits par colonne).
CREATE FUNCTION app.check_treatment_change() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF (OLD.validated_at IS NOT NULL
        AND (NEW.validated_at, NEW.validated_by_membership_id)
            IS DISTINCT FROM (OLD.validated_at, OLD.validated_by_membership_id))
       OR (OLD.removed_at IS NOT NULL AND NEW.removed_at IS DISTINCT FROM OLD.removed_at) THEN
      RAISE EXCEPTION 'followup_treatments : validation et retrait définitifs' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END $$;
CREATE TRIGGER followup_treatments_change BEFORE UPDATE ON followup_treatments
  FOR EACH ROW EXECUTE FUNCTION app.check_treatment_change();

-- Étapes et signes d'alerte du suivi --------------------------------------------------------

CREATE TABLE followup_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  followup_id uuid NOT NULL,
  -- Révision de la fiche qui a créé la ligne.
  revision integer NOT NULL CHECK (revision >= 1),
  position integer NOT NULL CHECK (position BETWEEN 1 AND 100),
  -- Heures après l'intervention, comme dans les protocoles.
  offset_hours integer NOT NULL CHECK (offset_hours BETWEEN 0 AND 2160),
  kind protocol_step_kind NOT NULL,
  content text NOT NULL CHECK (length(content) BETWEEN 2 AND 1000),
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (followup_id, id),
  FOREIGN KEY (organization_id, followup_id) REFERENCES followups (organization_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX followup_steps_current_key ON followup_steps (followup_id, position)
  WHERE superseded_at IS NULL;

CREATE TABLE followup_alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  followup_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision >= 1),
  position integer NOT NULL CHECK (position BETWEEN 1 AND 100),
  level alert_level NOT NULL,
  description text NOT NULL CHECK (length(description) BETWEEN 2 AND 300),
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (followup_id, id),
  FOREIGN KEY (organization_id, followup_id) REFERENCES followups (organization_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX followup_alert_rules_current_key ON followup_alert_rules (followup_id, position)
  WHERE superseded_at IS NULL;

-- Une ligne remplacée ne revient jamais ; son contenu ne change pas (droits par colonne).
CREATE FUNCTION app.check_superseded_once() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF OLD.superseded_at IS NOT NULL THEN
      RAISE EXCEPTION '% : ligne remplacée immuable', TG_TABLE_NAME USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END $$;
CREATE TRIGGER followup_steps_superseded_once BEFORE UPDATE ON followup_steps
  FOR EACH ROW EXECUTE FUNCTION app.check_superseded_once();
CREATE TRIGGER followup_alert_rules_superseded_once BEFORE UPDATE ON followup_alert_rules
  FOR EACH ROW EXECUTE FUNCTION app.check_superseded_once();

REVOKE ALL ON FUNCTION app.check_followup_transition(), app.check_treatment_change(),
  app.check_superseded_once() FROM PUBLIC;

-- Isolation des cabinets et droits -----------------------------------------------------------

DO $$
DECLARE
  tenant_table text;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY[
    'followup_imports', 'followup_treatments', 'followup_steps', 'followup_alert_rules'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = app.current_organization_id()) WITH CHECK (organization_id = app.current_organization_id())',
      tenant_table
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT ON followup_imports TO stivea_app;
GRANT SELECT, INSERT, UPDATE (validated_by_membership_id, validated_at, removed_at)
  ON followup_treatments TO stivea_app;
GRANT SELECT, INSERT, UPDATE (superseded_at) ON followup_steps, followup_alert_rules TO stivea_app;

-- Un assistant autorisé prépare la fiche ; seul un vétérinaire lance le suivi (§5).
UPDATE permissions
  SET label = 'Préparer et lancer un suivi (lancement réservé aux vétérinaires)'
  WHERE key = 'followups.launch';
