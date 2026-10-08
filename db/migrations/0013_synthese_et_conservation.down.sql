-- Annule 0013. Supprime les synthèses, les statistiques anonymisées et le balayage
-- quotidien ; rend à l'application la suppression directe : local, CI ou retour arrière validé.

DROP FUNCTION jobs.plan_retention_sweeps();
DROP POLICY retention_planner ON organizations;
DROP TABLE jobs.daily_runs;

GRANT DELETE ON followups, animals TO stivea_app;

DROP TRIGGER usage_events_followup_exists ON usage_events;
DROP FUNCTION app.check_usage_followup();
ALTER TABLE usage_events
  ADD FOREIGN KEY (organization_id, followup_id) REFERENCES followups (organization_id, id);

DROP FUNCTION app.purge_followup(uuid);
DROP FUNCTION app.followup_purge_due(timestamptz, timestamptz);
DROP SCHEMA stats CASCADE;
DROP TABLE followup_syntheses;
