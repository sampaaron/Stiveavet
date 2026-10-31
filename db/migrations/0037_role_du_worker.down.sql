-- Annule 0037 ; local, CI ou retour arrière validé. L'application web retrouve la file de tâches
-- et les purges, comme avant (ADR 0038). Le rôle stivea_worker reste : il n'a plus que les
-- droits hérités de stivea_app.
GRANT EXECUTE ON FUNCTION
  jobs.claim(text, text[], integer, integer),
  jobs.pending_outbox(integer),
  jobs.complete(uuid, text, integer),
  jobs.fail(uuid, text, integer, text),
  jobs.retry_delay(integer),
  jobs.give_up(uuid, text, integer, text),
  jobs.plan_retention_sweeps(),
  jobs.plan_billing_syncs(),
  jobs.plan_alert_recaps()
TO stivea_app;
GRANT EXECUTE ON FUNCTION
  app.purge_past_appointments(),
  app.purge_technical_records(),
  app.purge_stive_messages(),
  app.purge_followup(uuid)
TO stivea_app;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA jobs FROM stivea_worker;
REVOKE EXECUTE ON FUNCTION
  app.purge_past_appointments(),
  app.purge_technical_records(),
  app.purge_stive_messages(),
  app.purge_followup(uuid)
FROM stivea_worker;
REVOKE USAGE ON SCHEMA jobs FROM stivea_worker;
