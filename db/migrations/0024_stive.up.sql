-- 0024 : Stive, l'assistant IA de l'équipe (lot 29, ADR 0034).
--
-- Cahier des charges §10 et §11 : chaque personne a son propre Stive. Ses échanges ne sont
-- visibles que par elle, pas même par l'administrateur, et la base l'impose : la politique
-- compare le membre de la ligne à la personne connectée. Ils sont effacés 30 jours après leur
-- création, par le balayage quotidien du cabinet.
-- Architecture §10 : Stive ne fait que proposer. Une proposition garde la cible et le
-- changement prévus ; seul le clic de la personne exécute l'action de l'écran concerné, avec
-- ses propres vérifications de droits. Stive n'a aucun droit d'écriture sur les suivis ni sur
-- les rendez-vous.
-- Les demandes sont comptées par personne et par mois de Paris, pour la limite de la formule.

-- La ligne appartient-elle à la personne connectée, dans le cabinet courant ?
CREATE FUNCTION app.is_current_member(p_membership uuid) RETURNS boolean
  LANGUAGE sql STABLE
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = p_membership
        AND m.organization_id = app.current_organization_id()
        AND m.user_id = app.current_user_id()
    )
  $$;

-- Échanges ---------------------------------------------------------------------------------

CREATE TABLE stive_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  author text NOT NULL CHECK (author IN ('member', 'stive')),
  -- Question de la personne, telle qu'elle l'a écrite.
  question text CHECK (length(question) BETWEEN 1 AND 500),
  -- Réponse de Stive : données structurées, mises en mots à l'affichage (validées par Zod).
  answer jsonb CHECK (jsonb_typeof(answer) = 'object' AND length(answer::text) <= 40000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((author = 'member') = (question IS NOT NULL)),
  CHECK ((author = 'stive') = (answer IS NOT NULL)),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, membership_id) REFERENCES memberships (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX stive_messages_member_idx ON stive_messages (membership_id, created_at DESC);
CREATE INDEX stive_messages_age_idx ON stive_messages (organization_id, created_at);

-- Propositions « À confirmer » et brouillons -------------------------------------------------

CREATE TABLE stive_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  message_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('appointment', 'followup_status', 'message_draft')),
  followup_id uuid NOT NULL,
  appointment_id uuid,
  change text CHECK (change IN ('pause', 'resume', 'stop')),
  -- Brouillon : posé dans la zone de saisie, envoyé seulement si la personne clique.
  draft text CHECK (length(draft) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'expired')),
  outcome text CHECK (outcome IN ('confirmed', 'declined', 'paused', 'resumed', 'stopped')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CHECK (CASE kind
    WHEN 'appointment' THEN appointment_id IS NOT NULL AND change IS NULL AND draft IS NULL
    WHEN 'followup_status' THEN change IS NOT NULL AND appointment_id IS NULL AND draft IS NULL
    ELSE draft IS NOT NULL AND appointment_id IS NULL AND change IS NULL
  END),
  CHECK ((status = 'done') = (outcome IS NOT NULL)),
  CHECK ((status = 'open') = (decided_at IS NULL)),
  FOREIGN KEY (organization_id, membership_id) REFERENCES memberships (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, message_id) REFERENCES stive_messages (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, followup_id) REFERENCES followups (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, appointment_id) REFERENCES appointments (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX stive_proposals_message_idx ON stive_proposals (message_id);

-- Une proposition n'est traitée qu'une fois ; ensuite elle ne change plus.
CREATE FUNCTION app.check_stive_proposal() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF OLD.status <> 'open' THEN
      RAISE EXCEPTION 'proposition déjà traitée' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END $$;
CREATE TRIGGER stive_proposals_once BEFORE UPDATE ON stive_proposals
  FOR EACH ROW EXECUTE FUNCTION app.check_stive_proposal();

-- Demandes du mois, par personne -------------------------------------------------------------

CREATE TABLE stive_usage (
  organization_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  -- Mois de Paris (premier jour du mois).
  month date NOT NULL CHECK (extract(day FROM month) = 1),
  requests integer NOT NULL CHECK (requests BETWEEN 0 AND 100000),
  PRIMARY KEY (membership_id, month),
  FOREIGN KEY (organization_id, membership_id) REFERENCES memberships (organization_id, id) ON DELETE CASCADE
);

-- Le compteur ne fait que monter.
CREATE FUNCTION app.check_stive_usage() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF NEW.requests < OLD.requests THEN
      RAISE EXCEPTION 'compteur de demandes en baisse' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END $$;
CREATE TRIGGER stive_usage_grows BEFORE UPDATE ON stive_usage
  FOR EACH ROW EXECUTE FUNCTION app.check_stive_usage();

-- Isolation : par personne pour les échanges, par cabinet pour le compteur -------------------

ALTER TABLE stive_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE stive_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY own_stive ON stive_messages
  USING (organization_id = app.current_organization_id() AND app.is_current_member(membership_id))
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_current_member(membership_id));
-- Effacement à 30 jours, par la seule fonction ci-dessous (qui lit puis efface).
CREATE POLICY stive_retention ON stive_messages TO stivea_migrator
  USING (organization_id = app.current_organization_id() AND created_at <= now() - interval '30 days');

ALTER TABLE stive_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE stive_proposals FORCE ROW LEVEL SECURITY;
CREATE POLICY own_stive ON stive_proposals
  USING (organization_id = app.current_organization_id() AND app.is_current_member(membership_id))
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_current_member(membership_id));

ALTER TABLE stive_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE stive_usage FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON stive_usage
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());

-- Efface les échanges du cabinet courant arrivés à 30 jours (propositions comprises, en
-- cascade). Renvoie le nombre d'échanges effacés.
CREATE FUNCTION app.purge_stive_messages() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app
  AS $$
  DECLARE
    removed integer;
  BEGIN
    IF app.current_organization_id() IS NULL THEN
      RAISE EXCEPTION 'cabinet requis' USING ERRCODE = 'insufficient_privilege';
    END IF;
    DELETE FROM stive_messages
      WHERE organization_id = app.current_organization_id()
        AND created_at <= now() - interval '30 days';
    GET DIAGNOSTICS removed = ROW_COUNT;
    RETURN removed;
  END $$;

REVOKE ALL ON FUNCTION app.is_current_member(uuid), app.check_stive_proposal(),
  app.check_stive_usage(), app.purge_stive_messages() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_current_member(uuid), app.purge_stive_messages() TO stivea_app;

GRANT SELECT, INSERT, DELETE ON stive_messages TO stivea_app;
GRANT SELECT, INSERT, UPDATE (status, outcome, decided_at) ON stive_proposals TO stivea_app;
GRANT SELECT, INSERT, UPDATE (requests) ON stive_usage TO stivea_app;
