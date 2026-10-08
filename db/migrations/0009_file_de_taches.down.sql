-- Annule 0009. Supprime les fonctions de la file de tâches (les tables restent, voir 0008).

DROP FUNCTION jobs.fail(uuid, text, integer, text), jobs.complete(uuid, text, integer),
  jobs.pending_outbox(integer), jobs.claim(text, text[], integer, integer), jobs.recover_expired(),
  jobs.retry_delay(integer);
DROP SCHEMA jobs;
DROP INDEX scheduled_jobs_lease_idx;
DROP POLICY job_runner ON outbox_events;
DROP POLICY job_runner ON job_attempts;
DROP POLICY job_runner ON scheduled_jobs;
