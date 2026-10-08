-- 0009 : file de tâches (phase 2, lot 11).
--
-- Architecture §9 : chaque tâche est d'abord inscrite dans PostgreSQL (`scheduled_jobs`, 0008),
-- puis prise par un worker séparé ; tentatives espacées ; après le dernier échec, la tâche
-- est « en échec » et visible dans Stivea Vet. En local, la file est la table elle-même
-- (FOR UPDATE SKIP LOCKED) ; Scaleway Queues pourra la remplacer derrière le même service.
--
-- Le worker ne connaît pas le cabinet d'une tâche avant de la prendre : seules les fonctions
-- `jobs.claim` et `jobs.pending_outbox` voient tous les cabinets. Elles ne renvoient que des
-- identifiants, des types de tâche et des charges utiles faites d'identifiants (0008). Tout le
-- reste (exécution, réussite, échec, relance) se fait sous la RLS du cabinet de la tâche.

CREATE SCHEMA jobs;
REVOKE ALL ON SCHEMA jobs FROM PUBLIC;
GRANT USAGE ON SCHEMA jobs TO stivea_app;

-- Les fonctions de prise (propriété de stivea_migrator) parcourent tous les cabinets. Ces
-- politiques ne concernent que stivea_migrator ; le rôle applicatif reste soumis à 0008.
CREATE POLICY job_runner ON scheduled_jobs FOR ALL TO stivea_migrator USING (true) WITH CHECK (true);
CREATE POLICY job_runner ON job_attempts FOR ALL TO stivea_migrator USING (true) WITH CHECK (true);
CREATE POLICY job_runner ON outbox_events FOR SELECT TO stivea_migrator USING (true);

CREATE INDEX scheduled_jobs_lease_idx ON scheduled_jobs (locked_until) WHERE status = 'running';

-- Délai avant la tentative suivante, selon le nombre de tentatives déjà faites :
-- 1 min, 5 min, 15 min, 1 h, puis 3 h.
CREATE FUNCTION jobs.retry_delay(p_attempts integer) RETURNS interval
  LANGUAGE sql IMMUTABLE
  AS $$
    SELECT (ARRAY[interval '1 minute', interval '5 minutes', interval '15 minutes',
                  interval '1 hour', interval '3 hours'])[least(greatest(p_attempts, 1), 5)]
  $$;

-- Tâches dont le worker s'est arrêté en pleine exécution (bail expiré) : la tentative est
-- close en échec, puis la tâche est reprogrammée, ou mise en échec si c'était la dernière.
CREATE FUNCTION jobs.recover_expired() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, jobs
  AS $$
  #variable_conflict use_column
  DECLARE
    recovered integer;
  BEGIN
    WITH expired AS (
      SELECT j.id, j.attempts, j.max_attempts FROM scheduled_jobs j
      WHERE j.status = 'running' AND j.locked_until < now()
      FOR UPDATE SKIP LOCKED
    ), closed AS (
      UPDATE job_attempts a SET finished_at = now(), outcome = 'failed', error_code = 'lease_expired'
      FROM expired e
      WHERE a.job_id = e.id AND a.attempt_number = e.attempts AND a.outcome IS NULL
    ), updated AS (
      UPDATE scheduled_jobs j SET
        status = CASE WHEN e.attempts >= e.max_attempts THEN 'dead' ELSE 'pending' END::job_status,
        run_at = CASE WHEN e.attempts >= e.max_attempts THEN j.run_at
                      ELSE now() + jobs.retry_delay(e.attempts) END,
        locked_by = NULL,
        locked_until = NULL,
        last_error_code = 'lease_expired',
        finished_at = CASE WHEN e.attempts >= e.max_attempts THEN now() END
      FROM expired e
      WHERE j.id = e.id
      RETURNING j.id
    )
    SELECT count(*) INTO recovered FROM updated;
    RETURN recovered;
  END $$;

-- Prend au plus `p_batch` tâches dues parmi les types que ce worker sait exécuter, pour
-- `p_lease_seconds` secondes. Deux workers ne prennent jamais la même tâche.
CREATE FUNCTION jobs.claim(p_worker text, p_kinds text[], p_batch integer, p_lease_seconds integer)
  RETURNS TABLE (
    job_id uuid, organization_id uuid, kind text, attempt integer, followup_id uuid,
    payload jsonb, idempotency_key text
  )
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, jobs
  AS $$
  #variable_conflict use_column
  BEGIN
    IF p_worker IS NULL OR p_worker !~ '^[a-z0-9-]{1,64}$'
       OR p_batch IS NULL OR p_batch NOT BETWEEN 1 AND 100
       OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 10 AND 3600 THEN
      RAISE EXCEPTION 'paramètres de prise invalides' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    PERFORM jobs.recover_expired();
    RETURN QUERY
    WITH due AS (
      SELECT j.id FROM scheduled_jobs j
      WHERE j.status = 'pending' AND j.run_at <= now() AND j.kind = ANY (p_kinds)
      ORDER BY j.run_at, j.id
      FOR UPDATE SKIP LOCKED
      LIMIT p_batch
    ), claimed AS (
      UPDATE scheduled_jobs j SET
        status = 'running',
        attempts = j.attempts + 1,
        locked_by = p_worker,
        locked_until = now() + make_interval(secs => p_lease_seconds)
      FROM due
      WHERE j.id = due.id
      RETURNING j.id, j.organization_id, j.kind, j.attempts, j.followup_id, j.payload, j.idempotency_key
    ), opened AS (
      INSERT INTO job_attempts (organization_id, job_id, attempt_number)
      SELECT c.organization_id, c.id, c.attempts FROM claimed c
    )
    SELECT c.id, c.organization_id, c.kind, c.attempts, c.followup_id, c.payload, c.idempotency_key
    FROM claimed c;
  END $$;

-- Événements de l'outbox pas encore publiés : identifiant et cabinet seulement.
CREATE FUNCTION jobs.pending_outbox(p_batch integer)
  RETURNS TABLE (event_id uuid, organization_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
  AS $$
    SELECT e.id, e.organization_id FROM outbox_events e
    WHERE e.published_at IS NULL
    ORDER BY e.created_at, e.id
    LIMIT least(greatest(p_batch, 1), 100)
  $$;

-- Réussite et échec : exécutés dans la transaction du cabinet de la tâche (RLS), seulement
-- par le worker qui détient la tâche pour cette tentative. Un worker dont le bail a expiré
-- (tâche reprise ailleurs) ne peut plus rien écrire.
CREATE FUNCTION jobs.complete(p_job uuid, p_worker text, p_attempt integer) RETURNS boolean
  LANGUAGE plpgsql SET search_path = pg_catalog, public
  AS $$
  BEGIN
    UPDATE scheduled_jobs SET status = 'succeeded', locked_by = NULL, locked_until = NULL, finished_at = now()
    WHERE id = p_job AND status = 'running' AND locked_by = p_worker AND attempts = p_attempt;
    IF NOT FOUND THEN RETURN false; END IF;
    UPDATE job_attempts SET finished_at = now(), outcome = 'succeeded'
    WHERE job_id = p_job AND attempt_number = p_attempt AND outcome IS NULL;
    RETURN true;
  END $$;

-- Renvoie le nouvel état ('pending' : nouvelle tentative programmée, 'dead' : en échec),
-- ou NULL si ce worker ne détient plus la tâche.
CREATE FUNCTION jobs.fail(p_job uuid, p_worker text, p_attempt integer, p_code text) RETURNS job_status
  LANGUAGE plpgsql SET search_path = pg_catalog, public, jobs
  AS $$
  DECLARE
    new_status job_status;
  BEGIN
    UPDATE scheduled_jobs SET
      status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'pending' END::job_status,
      run_at = CASE WHEN attempts >= max_attempts THEN run_at ELSE now() + jobs.retry_delay(attempts) END,
      locked_by = NULL,
      locked_until = NULL,
      last_error_code = p_code,
      finished_at = CASE WHEN attempts >= max_attempts THEN now() END
    WHERE id = p_job AND status = 'running' AND locked_by = p_worker AND attempts = p_attempt
    RETURNING status INTO new_status;
    IF new_status IS NULL THEN RETURN NULL; END IF;
    UPDATE job_attempts SET finished_at = now(), outcome = 'failed', error_code = p_code
    WHERE job_id = p_job AND attempt_number = p_attempt AND outcome IS NULL;
    RETURN new_status;
  END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA jobs FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jobs.claim(text, text[], integer, integer), jobs.pending_outbox(integer),
  jobs.complete(uuid, text, integer), jobs.fail(uuid, text, integer, text), jobs.retry_delay(integer)
  TO stivea_app;
