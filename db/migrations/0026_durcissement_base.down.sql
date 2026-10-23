-- Annule 0026 ; local, CI ou retour arrière validé. Les factures renumérotées gardent leur
-- nouveau numéro (toujours au format de 0006).

-- 8. Index
DROP INDEX auth.trusted_devices_user_idx;
DROP INDEX login_events_time_idx;
DROP INDEX followup_treatments_followup_idx;
CREATE INDEX followup_treatments_followup_idx ON followup_treatments (followup_id) WHERE removed_at IS NULL;
DROP INDEX followup_alert_rules_followup_idx;
DROP INDEX followup_steps_followup_idx;
DROP INDEX animal_owners_owner_idx;
DROP INDEX owner_contacts_value_idx;
DROP INDEX followup_contacts_owner_contact_idx;
DROP INDEX followup_contacts_owner_idx;
DROP INDEX messages_org_time_idx;
DROP INDEX messages_contact_inbound_idx;
DROP INDEX triage_events_message_idx;
DROP INDEX voice_transcripts_followup_idx;
DROP INDEX photo_observations_followup_idx;
DROP INDEX stive_proposals_appointment_idx;
DROP INDEX stive_proposals_followup_idx;
DROP INDEX notification_deliveries_job_idx;
DROP INDEX outbox_events_published_idx;
DROP INDEX scheduled_jobs_finished_idx;
DROP INDEX scheduled_jobs_followup_idx;
DROP INDEX consents_followup_idx;
DROP INDEX appointment_requests_appointment_idx;
DROP INDEX appointments_animal_idx;
DROP INDEX appointments_followup_idx;
DROP INDEX alerts_unresolved_idx;
DROP INDEX alerts_followup_idx;
DROP INDEX followups_last_end_idx;
DROP INDEX followups_responsible_idx;
DROP INDEX followups_animal_idx;

-- 6. Concurrence, session et démo : versions de 0003, 0002 et 0025.
CREATE OR REPLACE FUNCTION app.keep_one_admin() RETURNS trigger
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

CREATE OR REPLACE FUNCTION auth.resolve_session(p_token_hash bytea, p_idle_timeout interval)
  RETURNS TABLE (
    session_id uuid, user_id uuid, organization_id uuid, membership_id uuid,
    role member_role, locked boolean
  )
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, auth
  AS $$
  DECLARE
    s auth.sessions%ROWTYPE;
    v_role member_role;
  BEGIN
    SELECT * INTO s FROM auth.sessions
    WHERE token_hash = p_token_hash AND revoked_at IS NULL AND expires_at > now()
    FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;

    SELECT m.role INTO v_role
    FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.id = s.membership_id AND m.deactivated_at IS NULL AND u.disabled_at IS NULL;
    IF v_role IS NULL THEN
      UPDATE auth.sessions SET revoked_at = now() WHERE id = s.id;
      RETURN;
    END IF;

    IF s.locked_at IS NULL AND s.last_activity_at < now() - p_idle_timeout THEN
      UPDATE auth.sessions SET locked_at = now() WHERE id = s.id;
      INSERT INTO login_events (organization_id, user_id, kind)
      VALUES (s.organization_id, s.user_id, 'session_locked');
      s.locked_at := now();
    ELSIF s.locked_at IS NULL THEN
      UPDATE auth.sessions SET last_activity_at = now() WHERE id = s.id;
    END IF;

    RETURN QUERY SELECT s.id, s.user_id, s.organization_id, s.membership_id, v_role,
      s.locked_at IS NOT NULL;
  END $$;

CREATE OR REPLACE FUNCTION marketing.capture_demo_lead(
  p_email text, p_cabinet_name text, p_vet_count smallint, p_locale text,
  p_access_token_hash bytea, p_link_token_hash bytea
) RETURNS TABLE (lead_id uuid, created boolean)
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, marketing
  AS $$
    INSERT INTO marketing.demo_leads AS l
      (email, cabinet_name, vet_count, locale, access_token_hash, link_token_hash,
       access_expires_at)
    VALUES (lower(p_email), btrim(p_cabinet_name), p_vet_count, p_locale, p_access_token_hash,
            p_link_token_hash, now() + interval '14 days')
    ON CONFLICT (email) DO UPDATE SET
      cabinet_name = EXCLUDED.cabinet_name,
      vet_count = EXCLUDED.vet_count,
      locale = EXCLUDED.locale,
      access_token_hash = EXCLUDED.access_token_hash,
      access_expires_at = EXCLUDED.access_expires_at
    RETURNING l.id, (xmax = 0)
  $$;

-- 5. Accès au contenu clinique
DO $$
DECLARE
  clinical_table text;
BEGIN
  FOREACH clinical_table IN ARRAY ARRAY[
    'messages', 'voice_transcripts', 'photo_observations', 'followup_syntheses',
    'triage_events', 'followup_imports', 'followup_treatments'
  ] LOOP
    EXECUTE format('DROP POLICY clinical_access ON %I', clinical_table);
  END LOOP;
END $$;
DROP FUNCTION app.clinical_followup_ids();

-- 4. Journaux
DROP TRIGGER login_events_no_truncate ON login_events;
DROP TRIGGER login_events_retention ON login_events;
DROP FUNCTION app.login_event_retention();
DROP TRIGGER audit_events_no_truncate ON audit_events;
DROP TRIGGER audit_events_no_delete ON audit_events;

-- 3. Droits sur toute la table, comme en 0001, 0003 et 0017.
DROP TRIGGER followups_test_fixed ON followups;
DROP FUNCTION app.followup_test_fixed();
DROP TRIGGER memberships_user_fixed ON memberships;
DROP FUNCTION app.membership_user_fixed();
REVOKE UPDATE ON organizations, users, memberships, followups, invitations, followup_shares
  FROM stivea_app;
GRANT UPDATE ON organizations, users, memberships, followups, invitations, followup_shares
  TO stivea_app;
GRANT UPDATE (alert_phone) ON memberships TO stivea_app;

-- 2. Factures et compte Stripe
ALTER TABLE billing_accounts
  DROP CONSTRAINT billing_accounts_requested_by_membership_fkey,
  ADD CONSTRAINT billing_accounts_requested_by_membership_id_fkey
    FOREIGN KEY (requested_by_membership_id) REFERENCES memberships (id);
DROP FUNCTION app.next_invoice_number(integer);
ALTER TABLE invoices DROP CONSTRAINT invoices_number_key;
DROP TABLE app.invoice_counters;

-- 1. Conservation : versions de 0013.
CREATE OR REPLACE FUNCTION jobs.plan_retention_sweeps() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, jobs
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
    WITH inserted AS (
      INSERT INTO scheduled_jobs (organization_id, kind, idempotency_key, run_at)
      SELECT o.id, 'retention.sweep', 'retention:' || to_char(today, 'YYYY-MM-DD'), now()
      FROM organizations o
      ON CONFLICT (organization_id, idempotency_key) DO NOTHING
      RETURNING 1
    )
    SELECT count(*)::integer INTO planned FROM inserted;
    RETURN planned;
  END $$;

DROP POLICY retention_purge_delete ON login_events;
DROP POLICY retention_purge ON login_events;
DROP FUNCTION auth.purge_expired();
DROP FUNCTION app.purge_technical_records();
DROP FUNCTION app.purge_past_appointments();

CREATE OR REPLACE FUNCTION app.purge_followup(p_followup uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app
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
      FROM followups fu
      JOIN animals a ON a.id = fu.animal_id
      LEFT JOIN protocol_versions pv ON pv.id = fu.protocol_version_id
      LEFT JOIN protocols p ON p.id = pv.protocol_id
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
        EXISTS (SELECT 1 FROM followup_status_events e
                WHERE e.followup_id = f.id AND e.to_status = 'ended' AND e.reason = 'control_date_reached'),
        EXISTS (SELECT 1 FROM consents c WHERE c.followup_id = f.id AND c.state = 'given'),
        (SELECT count(*) FROM messages m WHERE m.followup_id = f.id AND m.author = 'owner'),
        (SELECT count(*) FROM attachments t WHERE t.followup_id = f.id AND t.kind = 'photo'),
        (SELECT count(*) FROM attachments t WHERE t.followup_id = f.id AND t.kind = 'voice'),
        CASE (SELECT max(CASE t.level WHEN 'urgent' THEN 2 WHEN 'watch' THEN 1 ELSE 0 END)
              FROM triage_events t WHERE t.followup_id = f.id)
          WHEN 2 THEN 'urgent' WHEN 1 THEN 'watch' ELSE 'normal' END,
        (SELECT count(*) FROM alerts al WHERE al.followup_id = f.id AND al.level = 'watch'),
        (SELECT count(*) FROM alerts al WHERE al.followup_id = f.id AND al.level = 'urgent'),
        (SELECT count(*) FROM alerts al WHERE al.followup_id = f.id AND al.escalated_at IS NOT NULL);
    END IF;

    SELECT array_agg(DISTINCT x.owner_id) INTO owner_ids FROM (
      SELECT owner_id FROM followup_contacts WHERE followup_id = f.id
      UNION SELECT owner_id FROM animal_owners WHERE animal_id = f.animal_id
    ) x;

    DELETE FROM appointments WHERE followup_id = f.id;
    DELETE FROM outbox_events
      WHERE aggregate_id = f.id OR payload ->> 'followupId' = f.id::text;
    -- Contacts, conversation, fichiers, triage, alertes, tâches, fiche, synthèse : en cascade.
    DELETE FROM followups WHERE id = f.id;

    -- L'animal et ses propriétaires ne restent que s'ils servent encore.
    IF NOT EXISTS (SELECT 1 FROM followups WHERE animal_id = f.animal_id)
       AND NOT EXISTS (SELECT 1 FROM appointments WHERE animal_id = f.animal_id) THEN
      DELETE FROM animals WHERE id = f.animal_id;
    END IF;
    DELETE FROM owners o
      WHERE o.id = ANY (coalesce(owner_ids, '{}'))
        AND NOT EXISTS (SELECT 1 FROM animal_owners ao WHERE ao.owner_id = o.id)
        AND NOT EXISTS (SELECT 1 FROM followup_contacts fc WHERE fc.owner_id = o.id);
    RETURN true;
  END $$;

-- 7. search_path d'origine (sans pg_temp)
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
      AND cfg LIKE 'search_path=%, pg_temp'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = %s', r.fn,
      left(r.path, length(r.path) - length(', pg_temp')));
  END LOOP;
END $$;
