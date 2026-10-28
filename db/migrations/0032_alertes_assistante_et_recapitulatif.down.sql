-- Annule 0032 ; local, CI ou retour arrière validé.
DROP FUNCTION jobs.plan_alert_recaps();
DELETE FROM jobs.daily_runs WHERE kind IN ('alert.recap_midday', 'alert.recap_evening');
-- Cycle de vie des alertes de 0011.
CREATE OR REPLACE FUNCTION app.check_alert_transition() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
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
ALTER TABLE alerts
  DROP COLUMN forwarded_at,
  DROP COLUMN forwarded_by_membership_id;
ALTER TABLE permissions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE role_permissions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE membership_permissions NO FORCE ROW LEVEL SECURITY;
DELETE FROM membership_permissions WHERE permission = 'alerts.watch';
DELETE FROM role_permissions WHERE permission = 'alerts.watch';
DELETE FROM permissions WHERE key = 'alerts.watch';
ALTER TABLE permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE membership_permissions FORCE ROW LEVEL SECURITY;
