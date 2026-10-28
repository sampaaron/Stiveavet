-- 0030 : temps gagné par le cabinet (ADR 0046).
--
-- Nombre de prises de nouvelles faites par Numa à la place d'un appel de l'équipe : premier
-- message et étapes programmées de la fiche, partis au moins une fois (un message envoyé à
-- deux propriétaires compte une fois). Comme `app.activity_messages` (0028), la fonction ne
-- rend qu'un nombre, sans dépendre des droits sur chaque dossier ; les suivis test ne
-- comptent pas.
CREATE FUNCTION app.activity_check_ins(p_since timestamptz) RETURNS integer
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
  AS $$
  DECLARE
    org uuid := app.current_organization_id();
    check_ins integer;
  BEGIN
    IF org IS NULL THEN
      RAISE EXCEPTION 'cabinet requis' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_since IS NULL THEN
      RAISE EXCEPTION 'période invalide' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    SELECT count(DISTINCT CASE
        WHEN m.idempotency_key LIKE 'step:%' THEN split_part(m.idempotency_key, ':', 2)
        ELSE m.followup_id::text
      END)::integer INTO check_ins
    FROM public.messages m
    JOIN public.followups f ON f.id = m.followup_id AND f.organization_id = org
    WHERE m.organization_id = org AND NOT f.is_test AND m.occurred_at >= p_since
      AND m.author = 'numa' AND m.direction = 'outbound'
      AND m.delivery_status IN ('sent', 'delivered', 'read')
      AND (m.idempotency_key LIKE 'step:%' OR m.idempotency_key LIKE 'intro:%');
    RETURN check_ins;
  END $$;
REVOKE ALL ON FUNCTION app.activity_check_ins(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.activity_check_ins(timestamptz) TO stivea_app;
