-- 0003 : permissions fines, invitations, partage et réattribution des suivis.
--
-- Les droits sont des permissions précises (architecture §8), pas un libellé de rôle :
--   - `permissions` : catalogue fermé, identique pour tous les cabinets ;
--   - `role_permissions` : pour chaque rôle, les permissions autorisées et celles données par défaut ;
--   - `membership_permissions` : permissions effectives de chaque membre, modifiables par
--     l'administrateur dans la limite autorisée pour le rôle (contrôle en base).

CREATE TABLE permissions (
  key text PRIMARY KEY CHECK (key ~ '^[a-z_]+\.[a-z_]+$'),
  label text NOT NULL,
  -- Donne accès à des données cliniques (conversations, photos, vocaux, synthèses).
  clinical boolean NOT NULL DEFAULT false
);

INSERT INTO permissions (key, label, clinical) VALUES
  ('organization.settings', 'Modifier les réglages du cabinet', false),
  ('team.manage', 'Gérer l''équipe et les droits', false),
  ('protocols.manage', 'Créer et modifier les protocoles', false),
  ('billing.manage', 'Gérer l''abonnement et la facturation', false),
  ('activity_log.read', 'Consulter le journal d''activité', false),
  ('followups.read_all', 'Voir tous les suivis du cabinet (hors dossiers privés)', false),
  ('followups.read_own', 'Voir ses suivis et ceux partagés avec soi', false),
  ('followups.read_summary', 'Voir la liste organisationnelle des suivis, sans données cliniques', false),
  ('followups.launch', 'Lancer un suivi', false),
  ('followups.share', 'Partager ses suivis avec un confrère', false),
  ('clinical.read', 'Lire conversations, photos, vocaux et synthèses cliniques', true),
  ('owner_messages.reply', 'Répondre aux propriétaires', true),
  ('appointments.confirm', 'Confirmer manuellement un rendez-vous', false),
  ('agenda.read', 'Consulter l''agenda', false),
  ('stive.use', 'Utiliser Stive, l''assistant IA interne', false);

CREATE TABLE role_permissions (
  role member_role NOT NULL,
  permission text NOT NULL REFERENCES permissions (key),
  is_default boolean NOT NULL,
  PRIMARY KEY (role, permission)
);

-- Administrateur : tout. Vétérinaire : ses suivis. Assistant : minimum utile, le reste sur décision.
INSERT INTO role_permissions (role, permission, is_default)
SELECT 'admin_vet', key, true FROM permissions;

INSERT INTO role_permissions (role, permission, is_default) VALUES
  ('vet', 'followups.read_own', true),
  ('vet', 'followups.launch', true),
  ('vet', 'followups.share', true),
  ('vet', 'clinical.read', true),
  ('vet', 'owner_messages.reply', true),
  ('vet', 'appointments.confirm', true),
  ('vet', 'agenda.read', true),
  ('vet', 'stive.use', true),
  ('vet', 'followups.read_all', false),
  ('vet', 'protocols.manage', false),
  ('assistant', 'followups.read_summary', true),
  ('assistant', 'agenda.read', true),
  ('assistant', 'appointments.confirm', false),
  ('assistant', 'owner_messages.reply', false),
  ('assistant', 'clinical.read', false),
  ('assistant', 'followups.launch', false),
  ('assistant', 'stive.use', false);

-- Catalogues globaux : lecture seule pour tous, RLS pour respecter la règle « RLS partout ».
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY catalog_read ON permissions FOR SELECT USING (true);
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY catalog_read ON role_permissions FOR SELECT USING (true);
GRANT SELECT ON permissions, role_permissions TO stivea_app;

CREATE TABLE membership_permissions (
  organization_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  permission text NOT NULL REFERENCES permissions (key),
  granted_by_membership_id uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (membership_id, permission),
  FOREIGN KEY (organization_id, membership_id) REFERENCES memberships (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, granted_by_membership_id) REFERENCES memberships (organization_id, id)
);

-- Une permission ne peut être donnée qu'à un rôle qui l'autorise.
CREATE FUNCTION app.check_permission_allowed() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM memberships m
      JOIN role_permissions rp ON rp.role = m.role AND rp.permission = NEW.permission
      WHERE m.id = NEW.membership_id
    ) THEN
      RAISE EXCEPTION 'permission % non autorisée pour ce rôle', NEW.permission
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END $$;
CREATE TRIGGER membership_permissions_allowed BEFORE INSERT OR UPDATE ON membership_permissions
  FOR EACH ROW EXECUTE FUNCTION app.check_permission_allowed();

-- Création d'un membre ou changement de rôle : permissions remises aux valeurs par défaut du rôle.
CREATE FUNCTION app.apply_default_permissions() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      IF NEW.role = OLD.role THEN RETURN NEW; END IF;
      DELETE FROM membership_permissions WHERE membership_id = NEW.id;
    END IF;
    INSERT INTO membership_permissions (organization_id, membership_id, permission)
    SELECT NEW.organization_id, NEW.id, rp.permission
    FROM role_permissions rp WHERE rp.role = NEW.role AND rp.is_default;
    RETURN NEW;
  END $$;
CREATE TRIGGER memberships_default_permissions AFTER INSERT OR UPDATE OF role ON memberships
  FOR EACH ROW EXECUTE FUNCTION app.apply_default_permissions();

-- Membres existants (créés avant cette migration).
INSERT INTO membership_permissions (organization_id, membership_id, permission)
SELECT m.organization_id, m.id, rp.permission
FROM memberships m JOIN role_permissions rp ON rp.role = m.role AND rp.is_default;

-- Le cabinet garde toujours au moins un vétérinaire administrateur actif.
CREATE FUNCTION app.keep_one_admin() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF OLD.role = 'admin_vet' AND OLD.deactivated_at IS NULL
       AND (NEW.role <> 'admin_vet' OR NEW.deactivated_at IS NOT NULL)
       AND NOT EXISTS (
         SELECT 1 FROM memberships m
         WHERE m.organization_id = OLD.organization_id AND m.id <> OLD.id
           AND m.role = 'admin_vet' AND m.deactivated_at IS NULL
       ) THEN
      RAISE EXCEPTION 'le cabinet doit garder un vétérinaire administrateur actif'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END $$;
CREATE TRIGGER memberships_keep_one_admin BEFORE UPDATE OF role, deactivated_at ON memberships
  FOR EACH ROW EXECUTE FUNCTION app.keep_one_admin();

-- Invitations ---------------------------------------------------------------------

CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  email text NOT NULL CHECK (email = lower(email) AND email LIKE '%_@_%'),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
  role member_role NOT NULL,
  token_hash bytea NOT NULL UNIQUE CHECK (length(token_hash) = 32),
  invited_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, invited_by_membership_id) REFERENCES memberships (organization_id, id)
);
-- Une seule invitation en attente par adresse et par cabinet.
CREATE UNIQUE INDEX invitations_pending_key ON invitations (organization_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- Partages : un partage n'est valable qu'envers un vétérinaire.
ALTER TABLE followup_shares ADD COLUMN revoked_at timestamptz;

DO $$
DECLARE
  tenant_table text;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY['membership_permissions', 'invitations'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = app.current_organization_id()) WITH CHECK (organization_id = app.current_organization_id())',
      tenant_table
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, DELETE ON membership_permissions TO stivea_app;
GRANT SELECT, INSERT, UPDATE ON invitations TO stivea_app;

-- Les fonctions d'authentification lisent une invitation par son jeton, avant tout cabinet.
CREATE POLICY auth_lookup ON invitations FOR SELECT TO stivea_migrator USING (true);
CREATE POLICY auth_lookup ON organizations FOR SELECT TO stivea_migrator USING (true);

-- Invitation valide pour ce jeton : cabinet, adresse, nom, rôle, et si l'adresse a déjà un compte.
CREATE FUNCTION auth.invitation_for_token(p_token_hash bytea)
  RETURNS TABLE (
    invitation_id uuid, organization_id uuid, organization_name text, email text,
    display_name text, role member_role, email_registered boolean
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
  AS $$
    SELECT i.id, i.organization_id, o.name, i.email, i.display_name, i.role,
      EXISTS (SELECT 1 FROM users u WHERE u.email = i.email)
    FROM invitations i JOIN organizations o ON o.id = i.organization_id
    WHERE i.token_hash = p_token_hash AND i.accepted_at IS NULL AND i.revoked_at IS NULL
      AND i.expires_at > now()
  $$;
REVOKE ALL ON FUNCTION auth.invitation_for_token(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.invitation_for_token(bytea) TO stivea_app;

REVOKE ALL ON FUNCTION app.check_permission_allowed(), app.apply_default_permissions(), app.keep_one_admin() FROM PUBLIC;
