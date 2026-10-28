-- 0032 : alertes « à surveiller » prises en charge par l'assistante, récapitulatif des
-- alertes à 12 h et à 18 h (ADR 0049, étape 3 du plan « Faire gagner du temps au vétérinaire »).

-- 1. Droit `alerts.watch` : jamais donné d'office à une assistante, l'administrateur l'active.
-- Il ne vaut que pour les alertes « à surveiller », jamais pour une urgence (règle du service).
-- RLS forcée y compris pour le propriétaire : levée le temps de cette transaction seulement.
ALTER TABLE permissions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE role_permissions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE membership_permissions NO FORCE ROW LEVEL SECURITY;
INSERT INTO permissions (key, label, clinical) VALUES
  ('alerts.watch', 'Prendre en charge les alertes « à surveiller »', true);
INSERT INTO role_permissions (role, permission, is_default) VALUES
  ('admin_vet', 'alerts.watch', true),
  ('assistant', 'alerts.watch', false);
INSERT INTO membership_permissions (organization_id, membership_id, permission)
SELECT m.organization_id, m.id, 'alerts.watch'
FROM memberships m WHERE m.role = 'admin_vet';
ALTER TABLE permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE membership_permissions FORCE ROW LEVEL SECURITY;

-- 2. « Transmettre au vétérinaire » : l'assistante rend une alerte « à surveiller » au
-- vétérinaire prévenu, une seule fois. Une urgence va toujours directement au vétérinaire.
ALTER TABLE alerts
  ADD COLUMN forwarded_at timestamptz,
  ADD COLUMN forwarded_by_membership_id uuid,
  ADD CONSTRAINT alerts_forwarded_by_fkey FOREIGN KEY (organization_id, forwarded_by_membership_id)
    REFERENCES memberships (organization_id, id),
  ADD CONSTRAINT alerts_forwarded_pair CHECK ((forwarded_at IS NULL) = (forwarded_by_membership_id IS NULL)),
  ADD CONSTRAINT alerts_forwarded_watch CHECK (forwarded_at IS NULL OR level = 'watch');
GRANT UPDATE (forwarded_at, forwarded_by_membership_id) ON alerts TO stivea_app;

-- Cycle de vie de 0011, plus une transition : une alerte « à surveiller » prise en charge par
-- l'assistante redevient ouverte quand elle la transmet, une seule fois. La transmission est
-- ensuite figée.
CREATE OR REPLACE FUNCTION app.check_alert_transition() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  DECLARE
    forwarding boolean := OLD.forwarded_at IS NULL AND NEW.forwarded_at IS NOT NULL;
  BEGIN
    IF OLD.forwarded_at IS NOT NULL AND (
      NEW.forwarded_at IS DISTINCT FROM OLD.forwarded_at
      OR NEW.forwarded_by_membership_id IS DISTINCT FROM OLD.forwarded_by_membership_id
    ) THEN
      RAISE EXCEPTION 'transmission d''alerte figée' USING ERRCODE = 'check_violation';
    END IF;
    IF forwarding AND (OLD.status = 'resolved' OR NEW.status <> 'open') THEN
      RAISE EXCEPTION 'transmission d''alerte refusée' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = OLD.status THEN
      IF NEW.escalated_at IS DISTINCT FROM OLD.escalated_at
        OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at THEN
        RAISE EXCEPTION 'horodatage d''alerte figé' USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END IF;
    IF NOT (
      (OLD.status = 'open' AND NEW.status IN ('escalated', 'acknowledged', 'resolved'))
      OR (OLD.status = 'escalated' AND NEW.status IN ('acknowledged', 'resolved'))
      OR (OLD.status = 'acknowledged' AND NEW.status = 'resolved')
      OR (OLD.status = 'acknowledged' AND NEW.status = 'open' AND forwarding)
    ) THEN
      RAISE EXCEPTION 'changement d''état d''alerte refusé' USING ERRCODE = 'check_violation';
    END IF;
    -- Escalade : seulement pour une urgence, jamais avant l'heure prévue.
    IF NEW.status = 'escalated' AND (OLD.escalate_at IS NULL OR NEW.escalated_at < OLD.escalate_at) THEN
      RAISE EXCEPTION 'escalade avant l''heure prévue' USING ERRCODE = 'check_violation';
    END IF;
    -- Une alerte reçue l'a été par une personne identifiée.
    IF NEW.status = 'acknowledged' AND NOT EXISTS (
      SELECT 1 FROM acknowledgements a WHERE a.alert_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'accusé de réception manquant' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.escalated_at IS NOT NULL AND NEW.escalated_at IS DISTINCT FROM OLD.escalated_at THEN
      RAISE EXCEPTION 'horodatage d''alerte figé' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END $$;

-- 3. Récapitulatif des alertes aux vétérinaires, à 12 h et à 18 h (heure de Paris) : le
-- premier passage du worker dans le créneau inscrit une tâche `alert.recap` par cabinet.
-- Créneau manqué (worker arrêté) : rien n'est rattrapé, pour ne pas écrire la nuit.
CREATE FUNCTION jobs.plan_alert_recaps() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, jobs, pg_temp
  AS $$
  DECLARE
    local_now timestamp := now() AT TIME ZONE 'Europe/Paris';
    today date := local_now::date;
    hour integer := extract(hour FROM local_now)::integer;
    slot text;
    planned integer;
  BEGIN
    IF hour BETWEEN 12 AND 15 THEN
      slot := 'midday';
    ELSIF hour BETWEEN 18 AND 21 THEN
      slot := 'evening';
    ELSE
      RETURN 0;
    END IF;
    INSERT INTO jobs.daily_runs (kind, day) VALUES ('alert.recap_' || slot, today)
      ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN
      RETURN 0;
    END IF;
    WITH inserted AS (
      INSERT INTO scheduled_jobs (organization_id, kind, idempotency_key, run_at, payload)
      SELECT o.id, 'alert.recap',
        'alert:recap:' || to_char(today, 'YYYY-MM-DD') || ':' || slot, now(),
        jsonb_build_object('slot', slot)
      FROM organizations o
      ON CONFLICT (organization_id, idempotency_key) DO NOTHING
      RETURNING 1
    )
    SELECT count(*)::integer INTO planned FROM inserted;
    RETURN planned;
  END $$;

REVOKE ALL ON FUNCTION jobs.plan_alert_recaps() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jobs.plan_alert_recaps() TO stivea_app;
