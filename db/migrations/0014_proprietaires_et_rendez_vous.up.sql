-- 0014 : deux propriétaires, groupe WhatsApp simulé et rendez-vous proposés par Numa
-- (phase 2, lot 18).
--
-- Cahier des charges §6 : chaque contact accepte le suivi ; dès que les deux ont accepté, un
-- groupe dédié est créé. Un STOP écrit dans le groupe ouvre une clarification (quitter le
-- groupe seulement, ou arrêter le suivi entier) ; les relances à cette personne restent
-- suspendues en attendant sa réponse.
-- Cahier des charges §8 : Numa ne propose un créneau que dans les plages approuvées par le
-- cabinet, d'abord avec le vétérinaire responsable ; sinon le cabinet rappelle. Tant que
-- l'agenda vient d'une capture d'écran, le cabinet confirme ; un assistant ne confirme que si
-- l'administrateur lui a donné ce droit (`appointments.confirm`).

-- Deux propriétaires --------------------------------------------------------------------

-- STOP écrit dans le groupe : clarification en cours (rien n'est envoyé à cette personne).
ALTER TABLE followup_contacts ADD COLUMN stop_requested_at timestamptz;
GRANT UPDATE (stop_requested_at) ON followup_contacts TO stivea_app;

-- Portée d'un retrait d'accord : la personne seule, ou le suivi entier (§6).
CREATE TYPE consent_scope AS ENUM ('contact', 'followup');
ALTER TABLE consents ADD COLUMN scope consent_scope NOT NULL DEFAULT 'contact';
ALTER TABLE consents ADD CONSTRAINT consents_scope_withdrawn CHECK (scope = 'contact' OR state = 'withdrawn');

-- Durées des rendez-vous, réglées par le cabinet selon le type (§8) -----------------------

CREATE TABLE appointment_durations (
  organization_id uuid NOT NULL REFERENCES organizations (id),
  kind appointment_kind NOT NULL,
  minutes integer NOT NULL CHECK (minutes BETWEEN 5 AND 120 AND minutes % 5 = 0),
  updated_by_membership_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, kind),
  FOREIGN KEY (organization_id, updated_by_membership_id) REFERENCES memberships (organization_id, id)
);

-- Demandes de rendez-vous faites à Numa ---------------------------------------------------
--
-- `offered` : créneaux proposés (1 à 3, même durée) ; `chosen` : le propriétaire en a choisi
-- un, le rendez-vous attend la confirmation du cabinet ; `callback` : aucun créneau adapté
-- avec le vétérinaire responsable, le cabinet rappelle ; `closed` : traitée ou périmée.

CREATE TYPE appointment_request_status AS ENUM ('offered', 'chosen', 'callback', 'closed');

CREATE TABLE appointment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  followup_id uuid NOT NULL,
  -- Propriétaire qui a demandé, et conversation (directe ou groupe) où répondre.
  followup_contact_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  request_message_id uuid NOT NULL,
  -- Vétérinaire responsable de l'animal au moment de la demande.
  membership_id uuid NOT NULL,
  kind appointment_kind NOT NULL,
  minutes integer NOT NULL CHECK (minutes BETWEEN 5 AND 120),
  slot_starts timestamptz[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(slot_starts) <= 3 AND array_position(slot_starts, NULL) IS NULL),
  status appointment_request_status NOT NULL,
  appointment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '48 hours',
  closed_at timestamptz,
  closed_by_membership_id uuid,
  CHECK (CASE status
    WHEN 'offered' THEN cardinality(slot_starts) > 0 AND appointment_id IS NULL
    WHEN 'callback' THEN cardinality(slot_starts) = 0 AND appointment_id IS NULL
    WHEN 'chosen' THEN appointment_id IS NOT NULL
    ELSE true
  END),
  CHECK ((status = 'closed') = (closed_at IS NOT NULL)),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, followup_id) REFERENCES followups (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (followup_id, followup_contact_id) REFERENCES followup_contacts (followup_id, id),
  FOREIGN KEY (followup_id, thread_id) REFERENCES conversation_threads (followup_id, id),
  FOREIGN KEY (followup_id, request_message_id) REFERENCES messages (followup_id, id),
  FOREIGN KEY (organization_id, membership_id) REFERENCES memberships (organization_id, id),
  FOREIGN KEY (organization_id, appointment_id) REFERENCES appointments (organization_id, id),
  FOREIGN KEY (organization_id, closed_by_membership_id) REFERENCES memberships (organization_id, id)
);
CREATE INDEX appointment_requests_open_idx ON appointment_requests (organization_id, status)
  WHERE status <> 'closed';
CREATE INDEX appointment_requests_followup_idx ON appointment_requests (followup_id, created_at DESC);

DO $$
DECLARE
  tenant_table text;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY['appointment_durations', 'appointment_requests'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = app.current_organization_id()) WITH CHECK (organization_id = app.current_organization_id())',
      tenant_table
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE (minutes, updated_by_membership_id, updated_at) ON appointment_durations TO stivea_app;
GRANT SELECT, INSERT, UPDATE (status, appointment_id, closed_at, closed_by_membership_id)
  ON appointment_requests TO stivea_app;

-- Une demande ne change plus de créneaux ni de demandeur, et une demande close le reste.
CREATE FUNCTION app.check_appointment_request() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF OLD.status = 'closed' THEN
      RAISE EXCEPTION 'demande close' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT (
      NEW.status = OLD.status
      OR (OLD.status = 'offered' AND NEW.status IN ('chosen', 'callback', 'closed'))
      OR (OLD.status IN ('chosen', 'callback') AND NEW.status = 'closed')
    ) THEN
      RAISE EXCEPTION 'changement de demande refusé' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END $$;
CREATE TRIGGER appointment_requests_transition BEFORE UPDATE ON appointment_requests
  FOR EACH ROW EXECUTE FUNCTION app.check_appointment_request();

-- Rendez-vous : plages approuvées, vétérinaire responsable, confirmation autorisée ----------

-- Un créneau tient-il dans une plage approuvée pour les rendez-vous (heure de Paris) ?
CREATE FUNCTION app.within_appointment_window(p_starts timestamptz, p_ends timestamptz)
  RETURNS boolean
  LANGUAGE sql STABLE
  AS $$
    SELECT (p_starts AT TIME ZONE 'Europe/Paris')::date = (p_ends AT TIME ZONE 'Europe/Paris')::date
      AND EXISTS (
        SELECT 1 FROM availability_windows w
        WHERE w.kind = 'appointments'
          AND w.organization_id = app.current_organization_id()
          AND w.weekday = extract(isodow FROM p_starts AT TIME ZONE 'Europe/Paris')
          AND w.starts_at <= (p_starts AT TIME ZONE 'Europe/Paris')::time
          AND w.ends_at >= (p_ends AT TIME ZONE 'Europe/Paris')::time
      )
  $$;

-- Le membre peut-il confirmer un rendez-vous (actif, droit `appointments.confirm`) ?
CREATE FUNCTION app.may_confirm_appointment(p_membership uuid) RETURNS boolean
  LANGUAGE sql STABLE
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM memberships m
      JOIN membership_permissions p ON p.membership_id = m.id AND p.permission = 'appointments.confirm'
      WHERE m.id = p_membership
        AND m.deactivated_at IS NULL
        AND (app.current_user_id() IS NULL OR m.user_id = app.current_user_id())
    )
  $$;

CREATE FUNCTION app.check_appointment() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      IF NOT (
        NEW.status = OLD.status
        OR (OLD.status = 'proposed' AND NEW.status IN ('confirmed', 'cancelled'))
        OR (OLD.status = 'confirmed' AND NEW.status = 'cancelled')
      ) THEN
        RAISE EXCEPTION 'changement de rendez-vous refusé' USING ERRCODE = 'check_violation';
      END IF;
      -- Un rendez-vous proposé par Numa garde le créneau choisi par le propriétaire.
      IF OLD.source = 'numa' AND (NEW.starts_at <> OLD.starts_at OR NEW.ends_at <> OLD.ends_at
        OR NEW.membership_id <> OLD.membership_id) THEN
        RAISE EXCEPTION 'créneau figé' USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    IF NEW.source = 'numa' AND TG_OP = 'INSERT' THEN
      IF NEW.status <> 'proposed' OR NEW.followup_id IS NULL THEN
        RAISE EXCEPTION 'Numa ne fait que proposer' USING ERRCODE = 'check_violation';
      END IF;
      -- D'abord le vétérinaire responsable : Numa ne propose jamais un autre vétérinaire.
      IF NOT EXISTS (SELECT 1 FROM followups f
                     WHERE f.id = NEW.followup_id AND f.responsible_membership_id = NEW.membership_id) THEN
        RAISE EXCEPTION 'vétérinaire non responsable' USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.starts_at <= now() OR NOT app.within_appointment_window(NEW.starts_at, NEW.ends_at) THEN
        RAISE EXCEPTION 'hors des plages approuvées' USING ERRCODE = 'check_violation';
      END IF;
      -- Créneau libre lu sur l'agenda du vétérinaire (capture d'écran, en attendant dr.veto).
      IF NOT EXISTS (SELECT 1 FROM agenda_free_slots s
                     WHERE s.membership_id = NEW.membership_id
                       AND s.starts_at <= NEW.starts_at AND s.ends_at >= NEW.ends_at) THEN
        RAISE EXCEPTION 'créneau non libre' USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    -- Confirmé dans Stivea Vet : par un membre actif qui en a le droit, lui-même connecté.
    IF NEW.status = 'confirmed' AND NEW.source <> 'drveto'
       AND (TG_OP = 'INSERT' OR OLD.status <> 'confirmed')
       AND NOT app.may_confirm_appointment(NEW.confirmed_by_membership_id) THEN
      RAISE EXCEPTION 'confirmation non autorisée' USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Jamais deux rendez-vous en même temps pour un vétérinaire (sérialisé par vétérinaire).
    IF NEW.status <> 'cancelled' AND NEW.source <> 'drveto' THEN
      PERFORM pg_advisory_xact_lock(hashtext('appointments:' || NEW.membership_id::text));
      IF EXISTS (SELECT 1 FROM appointments a
                 WHERE a.membership_id = NEW.membership_id AND a.id <> NEW.id
                   AND a.status <> 'cancelled'
                   AND a.starts_at < NEW.ends_at AND a.ends_at > NEW.starts_at) THEN
        RAISE EXCEPTION 'créneau déjà pris' USING ERRCODE = 'exclusion_violation';
      END IF;
    END IF;
    RETURN NEW;
  END $$;
CREATE TRIGGER appointments_checked BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION app.check_appointment();

REVOKE ALL ON FUNCTION app.check_appointment_request(), app.within_appointment_window(timestamptz, timestamptz),
  app.may_confirm_appointment(uuid), app.check_appointment() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.within_appointment_window(timestamptz, timestamptz),
  app.may_confirm_appointment(uuid) TO stivea_app;
