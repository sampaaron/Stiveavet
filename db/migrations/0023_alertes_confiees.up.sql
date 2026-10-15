-- 0023 : confier une alerte à un autre vétérinaire (MVP, alertes).
--
-- Un vétérinaire qui lit le dossier en clinique peut confier une alerte non close à un
-- autre vétérinaire du cabinet qui le lit aussi ; l'application vérifie l'accès au dossier.
-- La base garantit le reste : seul le destinataire change, jamais sur une alerte close, et
-- toujours vers un vétérinaire actif du même cabinet.

CREATE FUNCTION app.check_alert_target() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF NEW.target_membership_id IS NOT DISTINCT FROM OLD.target_membership_id THEN
      RETURN NEW;
    END IF;
    IF OLD.status = 'resolved' THEN
      RAISE EXCEPTION 'destinataire d''une alerte close figé' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = NEW.target_membership_id
        AND m.organization_id = NEW.organization_id
        AND m.role IN ('admin_vet', 'vet')
        AND m.deactivated_at IS NULL
    ) THEN
      RAISE EXCEPTION 'destinataire d''alerte refusé' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END $$;
CREATE TRIGGER alerts_target_change BEFORE UPDATE OF target_membership_id ON alerts
  FOR EACH ROW EXECUTE FUNCTION app.check_alert_target();

REVOKE ALL ON FUNCTION app.check_alert_target() FROM PUBLIC;
GRANT UPDATE (target_membership_id) ON alerts TO stivea_app;
