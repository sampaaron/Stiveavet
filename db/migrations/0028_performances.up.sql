-- 0028 : performances et robustesse sous charge (ADR 0040).
--
-- 1. Échéances et prélèvements (ADR 0011, ADR 0027) : une tâche `billing.sync` par cabinet et
--    par jour, inscrite au premier passage du worker, sur le modèle de `jobs.plan_retention_sweeps`
--    (0013). La garde des droits ne fait plus que lire l'abonnement.
-- 2. Synthèse pré-consultation (ADR 0020) : une ligne par suivi et par langue de lecture.
--    Un lecteur français puis un lecteur anglais ne se font plus réécrire la synthèse l'un
--    l'autre (un appel à l'IA et une trace d'audit à chaque fois).
-- 3. Activité du cabinet (tableau de bord) : la politique `clinical_access` (0026) réduisait
--    les totaux de messages d'une assistante ou d'un vétérinaire limité aux seuls dossiers
--    qu'ils peuvent lire. Ces totaux, définis pour tout le cabinet, sont lus par deux fonctions
--    qui ne renvoient que des compteurs, jamais un identifiant ni un contenu.

CREATE FUNCTION jobs.plan_billing_syncs() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, jobs, pg_temp
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

CREATE FUNCTION app.activity_messages(p_since timestamptz)
  RETURNS TABLE (day text, inbound integer, outbound integer)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
  AS $$
  #variable_conflict use_column
  DECLARE
    org uuid := app.current_organization_id();
  BEGIN
    IF org IS NULL THEN
      RAISE EXCEPTION 'cabinet requis' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_since IS NULL THEN
      RAISE EXCEPTION 'période invalide' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    RETURN QUERY
      SELECT (m.occurred_at AT TIME ZONE 'Europe/Paris')::date::text,
        (count(*) FILTER (WHERE m.author = 'owner'))::integer,
        (count(*) FILTER (WHERE m.direction = 'outbound'))::integer
      FROM public.messages m
      JOIN public.followups f ON f.id = m.followup_id AND f.organization_id = org
      WHERE m.organization_id = org AND NOT f.is_test AND m.occurred_at >= p_since
      GROUP BY 1;
  END $$;
REVOKE ALL ON FUNCTION app.activity_messages(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.activity_messages(timestamptz) TO stivea_app;

-- Suivis lancés depuis `p_since` dont le propriétaire a répondu au moins une fois.
CREATE FUNCTION app.activity_answered(p_since timestamptz) RETURNS integer
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
  AS $$
  DECLARE
    org uuid := app.current_organization_id();
    answered integer;
  BEGIN
    IF org IS NULL THEN
      RAISE EXCEPTION 'cabinet requis' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_since IS NULL THEN
      RAISE EXCEPTION 'période invalide' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    SELECT count(*)::integer INTO answered
    FROM public.followups f
    WHERE f.organization_id = org AND NOT f.is_test AND f.started_at >= p_since
      AND EXISTS (
        SELECT 1 FROM public.messages m
        WHERE m.followup_id = f.id AND m.organization_id = org AND m.author = 'owner'
      );
    RETURN answered;
  END $$;
REVOKE ALL ON FUNCTION app.activity_answered(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.activity_answered(timestamptz) TO stivea_app;
