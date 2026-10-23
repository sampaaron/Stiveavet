-- 0028 : performances et robustesse sous charge (ADR 0040).
--
-- 1. Échéances et prélèvements (ADR 0011, ADR 0027) : une tâche `billing.sync` par cabinet et
--    par jour, inscrite au premier passage du worker, sur le modèle de `jobs.plan_retention_sweeps`
--    (0013). La garde des droits ne fait plus que lire l'abonnement.
-- 2. Synthèse pré-consultation (ADR 0020) : une ligne par suivi et par langue de lecture.
--    Un lecteur français puis un lecteur anglais ne se font plus réécrire la synthèse l'un
--    l'autre (un appel à l'IA et une trace d'audit à chaque fois).

CREATE FUNCTION jobs.plan_billing_syncs() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, jobs
  AS $$
  DECLARE
    today date := (now() AT TIME ZONE 'Europe/Paris')::date;
    planned integer;
  BEGIN
    INSERT INTO jobs.daily_runs (kind, day) VALUES ('billing.sync', today)
      ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN
      RETURN 0;
    END IF;
    WITH inserted AS (
      INSERT INTO scheduled_jobs (organization_id, kind, idempotency_key, run_at)
      SELECT o.id, 'billing.sync', 'billing:sync:' || to_char(today, 'YYYY-MM-DD'), now()
      FROM organizations o
      ON CONFLICT (organization_id, idempotency_key) DO NOTHING
      RETURNING 1
    )
    SELECT count(*)::integer INTO planned FROM inserted;
    RETURN planned;
  END $$;

REVOKE ALL ON FUNCTION jobs.plan_billing_syncs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jobs.plan_billing_syncs() TO stivea_app;

-- Les lignes existantes gardent le français : une synthèse lue en anglais est réécrite une fois.
ALTER TABLE followup_syntheses
  ADD COLUMN language text NOT NULL DEFAULT 'fr' CHECK (language IN ('fr', 'en'));
ALTER TABLE followup_syntheses ALTER COLUMN language DROP DEFAULT;
ALTER TABLE followup_syntheses DROP CONSTRAINT followup_syntheses_pkey;
ALTER TABLE followup_syntheses ADD PRIMARY KEY (followup_id, language);
