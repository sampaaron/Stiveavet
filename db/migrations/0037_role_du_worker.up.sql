-- 0037 : rôle séparé pour le worker (ADR 0054, prévu par l'ADR 0038). stivea_worker hérite des
-- droits de stivea_app (même RLS, mêmes tables) et reçoit seul la file de tâches et les purges :
-- une faille de l'application web ne permet plus de prendre, clore ou relancer une tâche, ni
-- d'effacer des données en avance. Le rôle est créé par db/bootstrap/roles.sql (local, CI) ou
-- par l'administrateur de la base (staging, production), avant cette migration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stivea_worker') THEN
    RAISE EXCEPTION 'Rôle stivea_worker absent : relancer db/bootstrap/roles.sql avec worker_password.';
  END IF;
  IF NOT pg_has_role('stivea_worker', 'stivea_app', 'MEMBER') THEN
    RAISE EXCEPTION 'stivea_worker doit hériter de stivea_app : GRANT stivea_app TO stivea_worker.';
  END IF;
END $$;

GRANT USAGE ON SCHEMA jobs TO stivea_worker;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA jobs FROM stivea_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA jobs TO stivea_worker;
-- Seule exception : un webhook WhatsApp signale l'échec d'un message déjà parti.
GRANT EXECUTE ON FUNCTION jobs.fail_after_success(uuid, text) TO stivea_app;

REVOKE EXECUTE ON FUNCTION
  app.purge_past_appointments(),
  app.purge_technical_records(),
  app.purge_stive_messages(),
  app.purge_followup(uuid)
FROM stivea_app;
GRANT EXECUTE ON FUNCTION
  app.purge_past_appointments(),
  app.purge_technical_records(),
  app.purge_stive_messages(),
  app.purge_followup(uuid)
TO stivea_worker;
