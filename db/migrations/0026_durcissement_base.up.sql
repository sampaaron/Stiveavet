-- 0026 : durcissement de la base après l'audit (ADR 0038).
--
-- 1. Conservation : un suivi avec une demande de rendez-vous s'efface ; les rendez-vous hors
--    suivi finis depuis un an, les traces d'authentification et les tables techniques échues
--    sont purgés par le balayage quotidien.
-- 2. Numéros de facture uniques chez l'émettrice : une suite continue par année, tous
--    cabinets confondus, tenue par la base.
-- 3. Droits de mise à jour par colonne ; identité d'un membre et nature « test » d'un suivi
--    lancé figées.
-- 4. Journal d'audit et journal de connexion : ni suppression ni vidage, même par le
--    propriétaire ; le journal de connexion ne s'efface qu'après ses 12 mois de conservation.
-- 5. Contenu clinique : la base impose aussi la règle d'accès de l'application (droit
--    `clinical.read`, responsable, partage actif, dossier privé).
-- 6. Concurrence : « au moins un administrateur actif » verrouillé par cabinet ; session lue
--    sans verrou et prolongée au plus une fois par minute.
-- 7. Fonctions SECURITY DEFINER : `pg_temp` en dernier dans leur search_path.
-- 8. Index des clés étrangères et des filtres fréquents.

-- 1. Conservation ------------------------------------------------------------------------

-- Comme en 0013, avec les demandes de rendez-vous effacées avant les rendez-vous qu'elles
-- citent (sinon la clé étrangère bloquait l'effacement du suivi).
CREATE OR REPLACE FUNCTION app.purge_followup(p_followup uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp
  AS $$
  DECLARE
    f record;
    owner_ids uuid[];
  BEGIN
    IF app.current_organization_id() IS NULL THEN
      RAISE EXCEPTION 'cabinet requis' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT fu.id, fu.animal_id, fu.status, fu.is_test, fu.started_at, fu.ended_at, fu.created_at,
           a.species::text AS species, coalesce(p.library_key,
             CASE WHEN fu.protocol_version_id IS NULL THEN 'aucun' ELSE 'personnalise' END) AS protocol_kind
      INTO f
      FROM public.followups fu
      JOIN public.animals a ON a.id = fu.animal_id
      LEFT JOIN public.protocol_versions pv ON pv.id = fu.protocol_version_id
      LEFT JOIN public.protocols p ON p.id = pv.protocol_id
      WHERE fu.id = p_followup AND fu.organization_id = app.current_organization_id()
      FOR UPDATE OF fu;
    IF NOT FOUND OR NOT app.followup_purge_due(f.ended_at, f.created_at) THEN
      RETURN false;
    END IF;

    IF NOT f.is_test AND f.status <> 'draft' THEN
      INSERT INTO stats.followup_outcomes (
        started_month, species, protocol_kind, duration_days, ended_automatically, consent_given,
        owner_messages, photos, voice_notes, max_triage, watch_alerts, urgent_alerts, escalated_alerts
      )
      SELECT
        date_trunc('month', coalesce(f.started_at, f.created_at) AT TIME ZONE 'Europe/Paris')::date,
        f.species,
        f.protocol_kind,
        CASE WHEN f.ended_at IS NOT NULL AND f.started_at IS NOT NULL
          THEN least(greatest(extract(day FROM f.ended_at - f.started_at)::integer, 0), 1000) END,
        EXISTS (SELECT 1 FROM public.followup_status_events e
                WHERE e.followup_id = f.id AND e.to_status = 'ended' AND e.reason = 'control_date_reached'),
        EXISTS (SELECT 1 FROM public.consents c WHERE c.followup_id = f.id AND c.state = 'given'),
        (SELECT count(*) FROM public.messages m WHERE m.followup_id = f.id AND m.author = 'owner'),
        (SELECT count(*) FROM public.attachments t WHERE t.followup_id = f.id AND t.kind = 'photo'),
        (SELECT count(*) FROM public.attachments t WHERE t.followup_id = f.id AND t.kind = 'voice'),
        CASE (SELECT max(CASE t.level WHEN 'urgent' THEN 2 WHEN 'watch' THEN 1 ELSE 0 END)
              FROM public.triage_events t WHERE t.followup_id = f.id)
          WHEN 2 THEN 'urgent' WHEN 1 THEN 'watch' ELSE 'normal' END,
        (SELECT count(*) FROM public.alerts al WHERE al.followup_id = f.id AND al.level = 'watch'),
        (SELECT count(*) FROM public.alerts al WHERE al.followup_id = f.id AND al.level = 'urgent'),
        (SELECT count(*) FROM public.alerts al WHERE al.followup_id = f.id AND al.escalated_at IS NOT NULL);
    END IF;

    SELECT array_agg(DISTINCT x.owner_id) INTO owner_ids FROM (
      SELECT owner_id FROM public.followup_contacts WHERE followup_id = f.id
      UNION SELECT owner_id FROM public.animal_owners WHERE animal_id = f.animal_id
    ) x;

    DELETE FROM public.appointment_requests WHERE followup_id = f.id;
    DELETE FROM public.appointments WHERE followup_id = f.id;
    DELETE FROM public.outbox_events
      WHERE aggregate_id = f.id OR payload ->> 'followupId' = f.id::text;
    -- Contacts, conversation, fichiers, triage, alertes, tâches, fiche, synthèse : en cascade.
    DELETE FROM public.followups WHERE id = f.id;

    -- L'animal et ses propriétaires ne restent que s'ils servent encore.
    IF NOT EXISTS (SELECT 1 FROM public.followups WHERE animal_id = f.animal_id)
       AND NOT EXISTS (SELECT 1 FROM public.appointments WHERE animal_id = f.animal_id) THEN
      DELETE FROM public.animals WHERE id = f.animal_id;
    END IF;
    DELETE FROM public.owners o
      WHERE o.id = ANY (coalesce(owner_ids, '{}'))
        AND NOT EXISTS (SELECT 1 FROM public.animal_owners ao WHERE ao.owner_id = o.id)
        AND NOT EXISTS (SELECT 1 FROM public.followup_contacts fc WHERE fc.owner_id = o.id);
    RETURN true;
  END $$;

-- Rendez-vous sans suivi (saisis par l'équipe ou venus de dr.veto) finis depuis plus d'un an,
-- à l'horloge de la base : sans eux, l'animal et ses propriétaires restaient pour toujours.
-- Un rendez-vous encore cité par une demande (suivi vivant) est gardé.
CREATE FUNCTION app.purge_past_appointments() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp
  AS $$
  DECLARE
    removed integer;
  BEGIN
    IF app.current_organization_id() IS NULL THEN
      RAISE EXCEPTION 'cabinet requis' USING ERRCODE = 'insufficient_privilege';
    END IF;
    DELETE FROM public.appointments a
      WHERE a.organization_id = app.current_organization_id()
        AND a.followup_id IS NULL
        AND a.ends_at <= now() - interval '1 year'
        AND NOT EXISTS (SELECT 1 FROM public.appointment_requests r WHERE r.appointment_id = a.id);
    GET DIAGNOSTICS removed = ROW_COUNT;
    RETURN removed;
  END $$;

-- Tables techniques du cabinet courant (identifiants seulement) : tâches terminées, événements
-- publiés, webhooks reçus et notifications au-delà de 90 jours. Tentatives en cascade.
CREATE FUNCTION app.purge_technical_records() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp
  AS $$
  DECLARE
    org uuid := app.current_organization_id();
    horizon timestamptz := now() - interval '90 days';
    removed integer := 0;
    n integer;
  BEGIN
    IF org IS NULL THEN
      RAISE EXCEPTION 'cabinet requis' USING ERRCODE = 'insufficient_privilege';
    END IF;
    DELETE FROM public.scheduled_jobs
      WHERE organization_id = org AND status IN ('succeeded', 'dead', 'cancelled') AND finished_at < horizon;
    GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
    DELETE FROM public.outbox_events WHERE organization_id = org AND published_at < horizon;
    GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
    DELETE FROM public.webhook_events WHERE organization_id = org AND received_at < horizon;
    GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
    DELETE FROM public.notification_deliveries WHERE organization_id = org AND created_at < horizon;
    GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
    RETURN removed;
  END $$;

-- Traces d'authentification échues, tous cabinets : sessions, codes, liens et appareils
-- expirés ou retirés depuis 30 jours, compteurs dont la fenêtre (une heure au plus) est
-- passée, journal de connexion au-delà de 12 mois. Appelée une fois par jour (ci-dessous).
CREATE FUNCTION auth.purge_expired() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp
  AS $$
  DECLARE
    horizon timestamptz := now() - interval '30 days';
    removed integer := 0;
    n integer;
  BEGIN
    DELETE FROM auth.sessions WHERE expires_at < horizon OR revoked_at < horizon;
    GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
    DELETE FROM auth.login_challenges WHERE expires_at < horizon;
    GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
    DELETE FROM auth.password_resets WHERE expires_at < horizon;
    GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
    DELETE FROM auth.trusted_devices WHERE expires_at < horizon OR revoked_at < horizon;
    GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
    DELETE FROM auth.rate_limits WHERE window_started_at < now() - interval '1 day';
    GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
    DELETE FROM public.login_events WHERE occurred_at < now() - interval '12 months';
    GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
    RETURN removed;
  END $$;

-- Seule voie d'effacement du journal de connexion (propriétaire soumis à la RLS forcée).
CREATE POLICY retention_purge ON login_events FOR SELECT TO stivea_migrator
  USING (occurred_at < now() - interval '12 months');
CREATE POLICY retention_purge_delete ON login_events FOR DELETE TO stivea_migrator
  USING (occurred_at < now() - interval '12 months');

-- Comme en 0013, et le premier passage du jour purge aussi les traces d'authentification.
CREATE OR REPLACE FUNCTION jobs.plan_retention_sweeps() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, jobs, pg_temp
  AS $$
  DECLARE
    today date := (now() AT TIME ZONE 'Europe/Paris')::date;
    planned integer;
  BEGIN
    INSERT INTO jobs.daily_runs (kind, day) VALUES ('retention.sweep', today)
      ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN
      RETURN 0;
    END IF;
    PERFORM auth.purge_expired();
    WITH inserted AS (
      INSERT INTO public.scheduled_jobs (organization_id, kind, idempotency_key, run_at)
      SELECT o.id, 'retention.sweep', 'retention:' || to_char(today, 'YYYY-MM-DD'), now()
      FROM public.organizations o
      ON CONFLICT (organization_id, idempotency_key) DO NOTHING
      RETURNING 1
    )
    SELECT count(*)::integer INTO planned FROM inserted;
    RETURN planned;
  END $$;

REVOKE ALL ON FUNCTION app.purge_past_appointments(), app.purge_technical_records(),
  auth.purge_expired() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.purge_past_appointments(), app.purge_technical_records() TO stivea_app;

-- 2. Numéros de facture ------------------------------------------------------------------
--
-- Stivea Vet est l'unique émettrice : un numéro unique, dans une suite chronologique et
-- continue par année, tous cabinets confondus (CGI, art. 242 nonies A). Le compteur de
-- l'année est verrouillé jusqu'à la fin de la transaction qui émet : une émission annulée
-- rend son numéro, sans trou.

CREATE TABLE app.invoice_counters (
  year integer PRIMARY KEY CHECK (year BETWEEN 2000 AND 2999),
  last_number integer NOT NULL CHECK (last_number >= 1)
);
REVOKE ALL ON app.invoice_counters FROM PUBLIC;

-- Factures déjà émises (données fictives) : renumérotées dans l'ordre d'émission, en deux
-- temps pour ne jamais croiser deux numéros d'un même cabinet. Facture figée et RLS forcée
-- levées le temps de cette transaction seulement.
ALTER TABLE invoices NO FORCE ROW LEVEL SECURITY;
ALTER TABLE invoices DISABLE TRIGGER invoices_status_only;
WITH ranked AS (
  SELECT id, substr(number, 4, 4) AS year,
    row_number() OVER (PARTITION BY substr(number, 4, 4) ORDER BY issued_at, id) AS n
  FROM invoices
)
UPDATE invoices i SET number = format('SV-%s-%s', r.year, 1000000 + r.n)
FROM ranked r WHERE r.id = i.id;
UPDATE invoices SET number = format('SV-%s-%s', substr(number, 4, 4),
  lpad((substr(number, 9)::integer - 1000000)::text, 3, '0'));
INSERT INTO app.invoice_counters (year, last_number)
SELECT substr(number, 4, 4)::integer, count(*) FROM invoices GROUP BY 1;
ALTER TABLE invoices ENABLE TRIGGER invoices_status_only;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;

ALTER TABLE invoices ADD CONSTRAINT invoices_number_key UNIQUE (number);

CREATE FUNCTION app.next_invoice_number(p_year integer) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app, pg_temp
  AS $$
  DECLARE
    n integer;
  BEGIN
    IF app.current_organization_id() IS NULL THEN
      RAISE EXCEPTION 'cabinet requis' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_year IS NULL OR p_year NOT BETWEEN 2000 AND 2999 THEN
      RAISE EXCEPTION 'année invalide' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    INSERT INTO app.invoice_counters AS c (year, last_number) VALUES (p_year, 1)
      ON CONFLICT (year) DO UPDATE SET last_number = c.last_number + 1
      RETURNING c.last_number INTO n;
    RETURN format('SV-%s-%s', p_year, lpad(n::text, greatest(3, length(n::text)), '0'));
  END $$;
REVOKE ALL ON FUNCTION app.next_invoice_number(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.next_invoice_number(integer) TO stivea_app;

-- Un compte Stripe ne cite qu'un membre de son propre cabinet (ADR 0006, règle 4).
ALTER TABLE billing_accounts
  DROP CONSTRAINT billing_accounts_requested_by_membership_id_fkey,
  ADD CONSTRAINT billing_accounts_requested_by_membership_fkey
    FOREIGN KEY (organization_id, requested_by_membership_id) REFERENCES memberships (organization_id, id);

-- 3. Droits de mise à jour par colonne ------------------------------------------------------
--
-- Le droit sur toute la table laissait par exemple réattribuer un membre à une autre personne
-- ou sortir un suivi terminé de la facturation. Un retrait au niveau de la table retire aussi
-- les droits par colonne : `alert_phone` (0017) est redonné ci-dessous.

REVOKE UPDATE ON organizations, users, memberships, followups, invitations, followup_shares
  FROM stivea_app;
GRANT UPDATE (name) ON organizations TO stivea_app;
GRANT UPDATE (display_name, ui_locale) ON users TO stivea_app;
GRANT UPDATE (role, deactivated_at, alert_phone) ON memberships TO stivea_app;
GRANT UPDATE (status, triage, is_private, responsible_membership_id, protocol_version_id,
  control_appointment_at, first_contact_at, plan_revision, started_at, ended_at)
  ON followups TO stivea_app;
GRANT UPDATE (accepted_at, revoked_at) ON invitations TO stivea_app;
GRANT UPDATE (granted_by_membership_id, expires_at, revoked_at, created_at)
  ON followup_shares TO stivea_app;

-- Même pour le propriétaire : un membre reste la même personne, et un suivi lancé ne devient
-- pas (ou ne cesse pas d'être) un suivi test.
CREATE FUNCTION app.membership_user_fixed() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'memberships : personne immuable' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END $$;
CREATE TRIGGER memberships_user_fixed BEFORE UPDATE OF user_id ON memberships
  FOR EACH ROW EXECUTE FUNCTION app.membership_user_fixed();

CREATE FUNCTION app.followup_test_fixed() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF OLD.status <> 'draft' AND NEW.is_test IS DISTINCT FROM OLD.is_test THEN
      RAISE EXCEPTION 'followups : suivi test figé au lancement' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END $$;
CREATE TRIGGER followups_test_fixed BEFORE UPDATE OF is_test ON followups
  FOR EACH ROW EXECUTE FUNCTION app.followup_test_fixed();

-- 4. Journaux en ajout seul ---------------------------------------------------------------

CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

-- Le journal de connexion n'est effacé qu'après 12 mois (auth.purge_expired), par personne.
CREATE FUNCTION app.login_event_retention() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF OLD.occurred_at >= now() - interval '12 months' THEN
      RAISE EXCEPTION 'login_events : conservation de 12 mois non échue'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END $$;
CREATE TRIGGER login_events_retention BEFORE DELETE ON login_events
  FOR EACH ROW EXECUTE FUNCTION app.login_event_retention();
CREATE TRIGGER login_events_no_truncate BEFORE TRUNCATE ON login_events
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

-- 5. Accès au contenu clinique --------------------------------------------------------------
--
-- Même règle que `followupAccess` (src/domains/suivis/policies.ts) au niveau « clinique » :
-- droit `clinical.read`, puis responsable ou partage actif (avec `followups.read_own` ou
-- `read_all`), ou dossier non privé (avec `read_all` ou `read_summary`). Calculée une fois par
-- requête (sous-requête) pour la personne connectée ; le worker et les webhooks, sans
-- personne, gardent le seul filtre du cabinet.
CREATE FUNCTION app.clinical_followup_ids() RETURNS uuid[]
  LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp
  AS $$
    WITH me AS (
      SELECT m.id,
        coalesce(bool_or(p.permission = 'clinical.read'), false) AS clinical,
        coalesce(bool_or(p.permission IN ('followups.read_own', 'followups.read_all')), false) AS own,
        coalesce(bool_or(p.permission IN ('followups.read_all', 'followups.read_summary')), false) AS listed
      FROM public.memberships m
      LEFT JOIN public.membership_permissions p ON p.membership_id = m.id
      WHERE m.organization_id = app.current_organization_id()
        AND m.user_id = app.current_user_id()
        AND m.deactivated_at IS NULL
      GROUP BY m.id
    )
    SELECT coalesce(array_agg(f.id), '{}')
    FROM public.followups f CROSS JOIN me
    WHERE me.clinical
      AND f.organization_id = app.current_organization_id()
      AND (
        (me.own AND (
          f.responsible_membership_id = me.id
          OR EXISTS (
            SELECT 1 FROM public.followup_shares s
            WHERE s.followup_id = f.id AND s.membership_id = me.id AND s.revoked_at IS NULL
              AND (s.expires_at IS NULL OR s.expires_at > now())
          )))
        OR (me.listed AND NOT f.is_private)
      )
  $$;
REVOKE ALL ON FUNCTION app.clinical_followup_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.clinical_followup_ids() TO stivea_app;

DO $$
DECLARE
  clinical_table text;
BEGIN
  FOREACH clinical_table IN ARRAY ARRAY[
    'messages', 'voice_transcripts', 'photo_observations', 'followup_syntheses',
    'triage_events', 'followup_imports', 'followup_treatments'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY clinical_access ON %I AS RESTRICTIVE TO stivea_app '
      'USING (app.current_user_id() IS NULL OR followup_id = ANY ((SELECT app.clinical_followup_ids())::uuid[])) '
      'WITH CHECK (app.current_user_id() IS NULL OR followup_id = ANY ((SELECT app.clinical_followup_ids())::uuid[]))',
      clinical_table
    );
  END LOOP;
END $$;

-- 6. Concurrence --------------------------------------------------------------------------

-- Comme en 0003, sérialisé par cabinet : deux administrateurs qui se retirent en même temps
-- ne voient plus chacun l'autre encore actif. Nom de contrainte stable pour l'application.
CREATE OR REPLACE FUNCTION app.keep_one_admin() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF OLD.role = 'admin_vet' AND OLD.deactivated_at IS NULL
       AND (NEW.role <> 'admin_vet' OR NEW.deactivated_at IS NOT NULL) THEN
      PERFORM pg_advisory_xact_lock(hashtext('admins:' || OLD.organization_id::text));
      IF NOT EXISTS (
        SELECT 1 FROM memberships m
        WHERE m.organization_id = OLD.organization_id AND m.id <> OLD.id
          AND m.role = 'admin_vet' AND m.deactivated_at IS NULL
      ) THEN
        RAISE EXCEPTION 'le cabinet doit garder un vétérinaire administrateur actif'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'memberships_keep_one_admin';
      END IF;
    END IF;
    RETURN NEW;
  END $$;

-- Comme en 0002, sans verrou de ligne : la dernière activité n'est écrite qu'une fois par
-- minute au plus (verrouillage d'inactivité précis à la minute), et le passage en verrouillé
-- n'est journalisé que par la requête qui l'a réellement fait.
CREATE OR REPLACE FUNCTION auth.resolve_session(p_token_hash bytea, p_idle_timeout interval)
  RETURNS TABLE (
    session_id uuid, user_id uuid, organization_id uuid, membership_id uuid,
    role member_role, locked boolean
  )
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp
  AS $$
  DECLARE
    s auth.sessions%ROWTYPE;
    v_role member_role;
    changed integer;
  BEGIN
    SELECT * INTO s FROM auth.sessions
    WHERE token_hash = p_token_hash AND revoked_at IS NULL AND expires_at > now();
    IF NOT FOUND THEN RETURN; END IF;

    SELECT m.role INTO v_role
    FROM public.memberships m JOIN public.users u ON u.id = m.user_id
    WHERE m.id = s.membership_id AND m.deactivated_at IS NULL AND u.disabled_at IS NULL;
    IF v_role IS NULL THEN
      UPDATE auth.sessions SET revoked_at = now() WHERE id = s.id AND revoked_at IS NULL;
      RETURN;
    END IF;

    IF s.locked_at IS NULL AND s.last_activity_at < now() - p_idle_timeout THEN
      UPDATE auth.sessions SET locked_at = now() WHERE id = s.id AND locked_at IS NULL;
      GET DIAGNOSTICS changed = ROW_COUNT;
      IF changed > 0 THEN
        INSERT INTO public.login_events (organization_id, user_id, kind)
        VALUES (s.organization_id, s.user_id, 'session_locked');
      END IF;
      s.locked_at := now();
    ELSIF s.locked_at IS NULL AND s.last_activity_at < now() - interval '1 minute' THEN
      UPDATE auth.sessions SET last_activity_at = now()
      WHERE id = s.id AND locked_at IS NULL AND last_activity_at < now() - interval '1 minute';
    END IF;

    RETURN QUERY SELECT s.id, s.user_id, s.organization_id, s.membership_id, v_role,
      s.locked_at IS NOT NULL;
  END $$;

-- Démo : une nouvelle demande pour une adresse confirmée ne change que la durée d'accès
-- (ni nom, ni langue, ni jeton : un tiers qui connaît l'adresse ne coupe plus l'accès).
CREATE OR REPLACE FUNCTION marketing.capture_demo_lead(
  p_email text, p_cabinet_name text, p_vet_count smallint, p_locale text,
  p_access_token_hash bytea, p_link_token_hash bytea
) RETURNS TABLE (lead_id uuid, created boolean)
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, marketing, pg_temp
  AS $$
    INSERT INTO marketing.demo_leads AS l
      (email, cabinet_name, vet_count, locale, access_token_hash, link_token_hash,
       access_expires_at)
    VALUES (lower(p_email), btrim(p_cabinet_name), p_vet_count, p_locale, p_access_token_hash,
            p_link_token_hash, now() + interval '14 days')
    ON CONFLICT (email) DO UPDATE SET
      cabinet_name = CASE WHEN l.confirmed_at IS NULL THEN EXCLUDED.cabinet_name ELSE l.cabinet_name END,
      vet_count = CASE WHEN l.confirmed_at IS NULL THEN EXCLUDED.vet_count ELSE l.vet_count END,
      locale = CASE WHEN l.confirmed_at IS NULL THEN EXCLUDED.locale ELSE l.locale END,
      access_token_hash = CASE WHEN l.confirmed_at IS NULL THEN EXCLUDED.access_token_hash
                               ELSE l.access_token_hash END,
      access_expires_at = EXCLUDED.access_expires_at
    RETURNING l.id, (xmax = 0)
  $$;

-- 7. pg_temp en dernier ---------------------------------------------------------------------
--
-- Sans lui, PostgreSQL cherche d'abord dans le schéma temporaire de la session : une table
-- temporaire `users` aurait masqué `public.users` dans une fonction SECURITY DEFINER.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn, substr(cfg, length('search_path=') + 1) AS path
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL unnest(p.proconfig) cfg
    WHERE p.prosecdef AND n.nspname IN ('app', 'auth', 'jobs', 'marketing')
      AND cfg LIKE 'search_path=%' AND cfg NOT LIKE '%pg_temp%'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = %s, pg_temp', r.fn, r.path);
  END LOOP;
END $$;

-- 8. Index ----------------------------------------------------------------------------------
-- Clés étrangères (cascades de l'effacement d'un suivi, d'un animal, d'un propriétaire) et
-- filtres fréquents (« mes suivis », registre, envois WhatsApp, tableau de bord, alertes).

CREATE INDEX followups_animal_idx ON followups (animal_id);
CREATE INDEX followups_responsible_idx ON followups (responsible_membership_id);
CREATE INDEX followups_last_end_idx ON followups (organization_id, ended_at DESC)
  WHERE NOT is_test AND ended_at IS NOT NULL;
CREATE INDEX alerts_followup_idx ON alerts (followup_id);
CREATE INDEX alerts_unresolved_idx ON alerts (organization_id, created_at DESC)
  WHERE status <> 'resolved';
CREATE INDEX appointments_followup_idx ON appointments (followup_id) WHERE followup_id IS NOT NULL;
CREATE INDEX appointments_animal_idx ON appointments (animal_id);
CREATE INDEX appointment_requests_appointment_idx ON appointment_requests (appointment_id)
  WHERE appointment_id IS NOT NULL;
CREATE INDEX consents_followup_idx ON consents (followup_id);
CREATE INDEX scheduled_jobs_followup_idx ON scheduled_jobs (followup_id) WHERE followup_id IS NOT NULL;
CREATE INDEX scheduled_jobs_finished_idx ON scheduled_jobs (organization_id, finished_at)
  WHERE finished_at IS NOT NULL;
CREATE INDEX outbox_events_published_idx ON outbox_events (organization_id, published_at)
  WHERE published_at IS NOT NULL;
CREATE INDEX notification_deliveries_job_idx ON notification_deliveries (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX stive_proposals_followup_idx ON stive_proposals (followup_id);
CREATE INDEX stive_proposals_appointment_idx ON stive_proposals (appointment_id)
  WHERE appointment_id IS NOT NULL;
CREATE INDEX photo_observations_followup_idx ON photo_observations (followup_id);
CREATE INDEX voice_transcripts_followup_idx ON voice_transcripts (followup_id);
CREATE INDEX triage_events_message_idx ON triage_events (message_id) WHERE message_id IS NOT NULL;
CREATE INDEX messages_contact_inbound_idx ON messages (followup_contact_id, occurred_at DESC)
  WHERE direction = 'inbound';
CREATE INDEX messages_org_time_idx ON messages (organization_id, occurred_at);
CREATE INDEX followup_contacts_owner_idx ON followup_contacts (owner_id);
CREATE INDEX followup_contacts_owner_contact_idx ON followup_contacts (owner_contact_id);
CREATE INDEX owner_contacts_value_idx ON owner_contacts (organization_id, kind, value);
CREATE INDEX animal_owners_owner_idx ON animal_owners (owner_id);
CREATE INDEX followup_steps_followup_idx ON followup_steps (followup_id);
CREATE INDEX followup_alert_rules_followup_idx ON followup_alert_rules (followup_id);
-- L'index partiel de 0010 ne servait pas aux cascades : remplacé par un index complet.
DROP INDEX followup_treatments_followup_idx;
CREATE INDEX followup_treatments_followup_idx ON followup_treatments (followup_id);
CREATE INDEX login_events_time_idx ON login_events (occurred_at);
CREATE INDEX trusted_devices_user_idx ON auth.trusted_devices (user_id);
