-- 0025 : la séquence de démo n'est envoyée qu'à une adresse confirmée (ADR 0036).
--
-- Jusqu'ici, une demande de démo faite avec l'adresse d'un tiers lui envoyait cinq e-mails.
-- Désormais, le premier e-mail porte un lien qui lui est propre (jamais remis au navigateur
-- qui a fait la demande) ; les quatre suivants ne partent qu'après un clic sur ce lien.
-- Une nouvelle demande avec la même adresse ne remplace plus ce lien.

ALTER TABLE marketing.demo_leads
  ADD COLUMN link_token_hash bytea UNIQUE CHECK (length(link_token_hash) = 32),
  ADD COLUMN confirmed_at timestamptz;

-- Les prospects existants (données fictives) gardent leur séquence en cours.
UPDATE marketing.demo_leads SET confirmed_at = created_at;

DROP FUNCTION marketing.capture_demo_lead(text, text, smallint, text, bytea);

CREATE FUNCTION marketing.capture_demo_lead(
  p_email text, p_cabinet_name text, p_vet_count smallint, p_locale text,
  p_access_token_hash bytea, p_link_token_hash bytea
) RETURNS TABLE (lead_id uuid, created boolean)
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, marketing
  AS $$
    INSERT INTO marketing.demo_leads AS l
      (email, cabinet_name, vet_count, locale, access_token_hash, link_token_hash,
       access_expires_at)
    VALUES (lower(p_email), btrim(p_cabinet_name), p_vet_count, p_locale, p_access_token_hash,
            p_link_token_hash, now() + interval '14 days')
    ON CONFLICT (email) DO UPDATE SET
      cabinet_name = EXCLUDED.cabinet_name,
      vet_count = EXCLUDED.vet_count,
      locale = EXCLUDED.locale,
      access_token_hash = EXCLUDED.access_token_hash,
      access_expires_at = EXCLUDED.access_expires_at
    RETURNING l.id, (xmax = 0)
  $$;

-- Accès à la démo par le navigateur qui l'a demandée ou par le lien de l'e-mail.
CREATE OR REPLACE FUNCTION marketing.demo_access(p_access_token_hash bytea)
  RETURNS TABLE (locale text, cabinet_name text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, marketing
  AS $$
    SELECT l.locale, l.cabinet_name FROM marketing.demo_leads l
    WHERE p_access_token_hash IN (l.access_token_hash, l.link_token_hash)
      AND l.access_expires_at > now()
  $$;

-- Clic sur le lien du premier e-mail : l'adresse est confirmée, la suite peut partir.
CREATE FUNCTION marketing.open_demo_link(p_link_token_hash bytea)
  RETURNS TABLE (locale text, cabinet_name text)
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, marketing
  AS $$
    UPDATE marketing.demo_leads l SET confirmed_at = coalesce(l.confirmed_at, now())
    WHERE l.link_token_hash = p_link_token_hash AND l.access_expires_at > now()
    RETURNING l.locale, l.cabinet_name
  $$;

CREATE OR REPLACE FUNCTION marketing.due_demo_emails(p_limit integer)
  RETURNS TABLE (lead_id uuid, email text, cabinet_name text, locale text, step smallint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, marketing
  AS $$
    SELECT l.id, l.email, l.cabinet_name, l.locale, (coalesce(last.step, 0) + 1)::smallint
    FROM marketing.demo_leads l
    LEFT JOIN LATERAL (
      SELECT e.step, e.reserved_at FROM marketing.demo_emails e
      WHERE e.lead_id = l.id ORDER BY e.step DESC LIMIT 1
    ) last ON true
    WHERE marketing.sequence_open(l)
      AND coalesce(last.step, 0) < 5
      AND (last.step IS NULL OR l.confirmed_at IS NOT NULL)
      AND now() >= l.created_at
        + make_interval(days => (marketing.sequence_days())[coalesce(last.step, 0) + 1])
      AND (last.reserved_at IS NULL OR now() >= last.reserved_at + interval '20 hours')
    ORDER BY l.created_at
    LIMIT least(greatest(p_limit, 0), 200)
  $$;

CREATE OR REPLACE FUNCTION marketing.reserve_demo_email(
  p_lead_id uuid, p_step smallint, p_unsubscribe_token_hash bytea
) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, marketing
  AS $$
  DECLARE
    v_lead marketing.demo_leads;
    v_last smallint;
  BEGIN
    SELECT * INTO v_lead FROM marketing.demo_leads WHERE id = p_lead_id FOR UPDATE;
    IF NOT FOUND OR NOT marketing.sequence_open(v_lead) THEN RETURN false; END IF;
    IF p_step > 1 AND v_lead.confirmed_at IS NULL THEN RETURN false; END IF;
    SELECT coalesce(max(step), 0) INTO v_last FROM marketing.demo_emails WHERE lead_id = p_lead_id;
    IF p_step <> v_last + 1 THEN RETURN false; END IF;
    INSERT INTO marketing.demo_emails (lead_id, step, unsubscribe_token_hash)
    VALUES (p_lead_id, p_step, p_unsubscribe_token_hash);
    RETURN true;
  END $$;

REVOKE ALL ON FUNCTION
  marketing.capture_demo_lead(text, text, smallint, text, bytea, bytea),
  marketing.open_demo_link(bytea)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  marketing.capture_demo_lead(text, text, smallint, text, bytea, bytea),
  marketing.open_demo_link(bytea)
TO stivea_app;
