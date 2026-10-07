-- 0011 : triage, alertes et garde (phase 2, lot 14).
--
-- Cahier des charges §7. Chaque message du propriétaire est évalué par des règles
-- déterministes issues des signes d'alerte du suivi ; « à surveiller » et « urgent » créent
-- une alerte pour le vétérinaire responsable ou de garde. Une urgence sans accusé de
-- réception est escaladée aux autres vétérinaires après le délai réglé (3 à 5 h).
--   - Le signe d'alerte reconnu est celui de la fiche du suivi (lot 12), pas seulement celui
--     du protocole : nouvelle référence `followup_alert_rule_id`.
--   - Le cycle de vie d'une alerte est vérifié par la base : ouverte, escaladée, reçue,
--     close ; une alerte close ne se rouvre jamais.

ALTER TABLE triage_events ADD COLUMN followup_alert_rule_id uuid;
ALTER TABLE triage_events
  ADD FOREIGN KEY (followup_id, followup_alert_rule_id) REFERENCES followup_alert_rules (followup_id, id),
  ADD CHECK (alert_rule_id IS NULL OR followup_alert_rule_id IS NULL);

CREATE FUNCTION app.check_alert_transition() RETURNS trigger
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
CREATE TRIGGER alerts_status_transition BEFORE UPDATE ON alerts
  FOR EACH ROW EXECUTE FUNCTION app.check_alert_transition();

REVOKE ALL ON FUNCTION app.check_alert_transition() FROM PUBLIC;
