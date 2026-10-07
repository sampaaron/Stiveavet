-- Annule 0011. Supprime le contrôle du cycle de vie des alertes et la référence au signe
-- d'alerte de la fiche du suivi : local, CI ou retour arrière validé.

DROP TRIGGER alerts_status_transition ON alerts;
DROP FUNCTION app.check_alert_transition();
ALTER TABLE triage_events DROP COLUMN followup_alert_rule_id;
