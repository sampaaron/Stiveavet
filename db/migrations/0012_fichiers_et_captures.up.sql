-- 0012 : photos, vocaux et captures d'agenda (phase 2, lot 16).
--
-- Cahier des charges §4 et §8, architecture §7. Les fichiers restent dans le stockage objet
-- privé (la base ne garde que la clé) ; ce qui en est tiré est rangé ici :
--   - la durée d'un message vocal, pour l'afficher sans relire le fichier ;
--   - les observations de l'analyse photo (désactivée par défaut, observations seulement) ;
--   - les créneaux libres lus sur une capture d'agenda, supprimée dès la lecture.
-- Nouvelle permission `agenda.capture` : le vétérinaire, ou un assistant autorisé par
-- l'administrateur, envoie une capture d'agenda (cahier des charges §8).

ALTER TABLE permissions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE role_permissions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE membership_permissions NO FORCE ROW LEVEL SECURITY;
INSERT INTO permissions (key, label, clinical) VALUES
  ('agenda.capture', 'Envoyer une capture d''agenda (créneaux libres)', false);
INSERT INTO role_permissions (role, permission, is_default) VALUES
  ('admin_vet', 'agenda.capture', true),
  ('vet', 'agenda.capture', true),
  ('assistant', 'agenda.capture', false);
INSERT INTO membership_permissions (organization_id, membership_id, permission)
SELECT m.organization_id, m.id, 'agenda.capture'
FROM memberships m WHERE m.role IN ('admin_vet', 'vet');
ALTER TABLE permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE membership_permissions FORCE ROW LEVEL SECURITY;

-- Durée d'un message vocal (millisecondes), connue à la réception.
ALTER TABLE attachments
  ADD COLUMN duration_ms integer,
  ADD CHECK (duration_ms IS NULL OR (kind = 'voice' AND duration_ms BETWEEN 1 AND 3600000));

-- Analyse photo assistée (cahier des charges §4) ------------------------------------------

CREATE TABLE photo_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  followup_id uuid NOT NULL,
  attachment_id uuid NOT NULL UNIQUE,
  -- Contenu clinique : observations seulement (jamais de diagnostic), une par ligne.
  observations text NOT NULL CHECK (length(observations) BETWEEN 1 AND 2000),
  -- Moteur : simulé tant qu'aucun fournisseur n'est validé (ADR 0004).
  engine text NOT NULL DEFAULT 'simulated' CHECK (engine = 'simulated'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, followup_id) REFERENCES followups (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (followup_id, attachment_id) REFERENCES attachments (followup_id, id) ON DELETE CASCADE
);

-- Une observation ne porte que sur une photo.
CREATE FUNCTION app.check_photo_attachment() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM attachments a WHERE a.id = NEW.attachment_id AND a.kind = 'photo') THEN
      RAISE EXCEPTION 'une observation porte sur une photo' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END $$;
CREATE TRIGGER photo_observations_photo_only BEFORE INSERT OR UPDATE ON photo_observations
  FOR EACH ROW EXECUTE FUNCTION app.check_photo_attachment();

-- Créneaux libres lus sur une capture d'agenda (cahier des charges §8) -------------------

CREATE TABLE agenda_free_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  -- Vétérinaire dont l'agenda a été capturé.
  membership_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  -- Origine : capture d'écran en attendant les intégrations d'agenda (dr.veto en phase 3).
  source text NOT NULL DEFAULT 'capture' CHECK (source = 'capture'),
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at AND ends_at <= starts_at + interval '4 hours'),
  UNIQUE (membership_id, starts_at),
  FOREIGN KEY (organization_id, membership_id) REFERENCES memberships (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, created_by_membership_id) REFERENCES memberships (organization_id, id)
);
CREATE INDEX agenda_free_slots_time_idx ON agenda_free_slots (organization_id, starts_at);

REVOKE ALL ON FUNCTION app.check_photo_attachment() FROM PUBLIC;

DO $$
DECLARE
  tenant_table text;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY['photo_observations', 'agenda_free_slots'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = app.current_organization_id()) WITH CHECK (organization_id = app.current_organization_id())',
      tenant_table
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT ON photo_observations TO stivea_app;
-- Un créneau pris ou périmé se retire ; une nouvelle capture remplace les créneaux à venir.
GRANT SELECT, INSERT, DELETE ON agenda_free_slots TO stivea_app;
