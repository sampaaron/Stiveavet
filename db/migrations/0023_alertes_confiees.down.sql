-- Annule 0023 ; local, CI ou retour arrière validé.
REVOKE UPDATE (target_membership_id) ON alerts FROM stivea_app;
DROP TRIGGER alerts_target_change ON alerts;
DROP FUNCTION app.check_alert_target();
