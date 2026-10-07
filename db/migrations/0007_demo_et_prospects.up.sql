-- 0007 : démo du site public et séquence de cinq e-mails (cahier des charges §13 et §14).
--
-- Les prospects ne sont pas des cabinets : leurs données vivent dans un schéma à part,
-- `marketing`, séparé des données de suivi. Comme pour `auth` (0002), le rôle applicatif n'a
-- AUCUN droit direct sur ces tables : il passe par les fonctions SECURITY DEFINER ci-dessous,
-- chacune limitée à une opération précise. Les jetons (accès à la démo, désinscription) ne
-- sont jamais stockés en clair : seulement leur empreinte SHA-256, calculée par l'application.
-- L'horloge est celle de la base : l'application ne peut ni avancer la séquence, ni prolonger
-- un accès, ni purger des prospects récents.

CREATE SCHEMA marketing;
REVOKE ALL ON SCHEMA marketing FROM PUBLIC;
GRANT USAGE ON SCHEMA marketing TO stivea_app;

CREATE TABLE marketing.demo_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  cabinet_name text NOT NULL CHECK (length(btrim(cabinet_name)) BETWEEN 2 AND 160),
  -- 1 à 3 vétérinaires ; 4 signifie « plus de trois » (offre sur demande).
  vet_count smallint NOT NULL CHECK (vet_count BETWEEN 1 AND 4),
  locale text NOT NULL CHECK (locale IN ('fr', 'en')),
  access_token_hash bytea NOT NULL UNIQUE CHECK (length(access_token_hash) = 32),
  access_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  unsubscribed_at timestamptz
);

-- Un e-mail de la séquence par étape et par prospect, au plus. La ligne est réservée avant
-- l'envoi (au plus un envoi), puis marquée envoyée ; un échec d'envoi libère la réservation.
CREATE TABLE marketing.demo_emails (
  lead_id uuid NOT NULL REFERENCES marketing.demo_leads (id) ON DELETE CASCADE,
  step smallint NOT NULL CHECK (step BETWEEN 1 AND 5),
  unsubscribe_token_hash bytea NOT NULL UNIQUE CHECK (length(unsubscribe_token_hash) = 32),
  reserved_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  PRIMARY KEY (lead_id, step)
);

REVOKE ALL ON ALL TABLES IN SCHEMA marketing FROM PUBLIC;

-- Calendrier de la séquence, en jours après la demande de démo : cinq e-mails sur deux semaines.
CREATE FUNCTION marketing.sequence_days() RETURNS integer[]
  LANGUAGE sql IMMUTABLE
  AS $$ SELECT ARRAY[0, 2, 5, 9, 13] $$;

-- Enregistre (ou met à jour) un prospect et lui ouvre la démo pour 14 jours. Une nouvelle
-- demande avec la même adresse renouvelle l'accès sans relancer la séquence ni annuler une
-- désinscription.
CREATE FUNCTION marketing.capture_demo_lead(
  p_email text, p_cabinet_name text, p_vet_count smallint, p_locale text, p_access_token_hash bytea
) RETURNS TABLE (lead_id uuid, created boolean)
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, marketing
  AS $$
    INSERT INTO marketing.demo_leads AS l
      (email, cabinet_name, vet_count, locale, access_token_hash, access_expires_at)
    VALUES (lower(p_email), btrim(p_cabinet_name), p_vet_count, p_locale, p_access_token_hash,
            now() + interval '14 days')
    ON CONFLICT (email) DO UPDATE SET
      cabinet_name = EXCLUDED.cabinet_name,
      vet_count = EXCLUDED.vet_count,
      locale = EXCLUDED.locale,
      access_token_hash = EXCLUDED.access_token_hash,
      access_expires_at = EXCLUDED.access_expires_at
    RETURNING l.id, (xmax = 0)
  $$;

-- Accès à la démo : seulement la langue et le nom du cabinet, jamais l'e-mail.
CREATE FUNCTION marketing.demo_access(p_access_token_hash bytea)
  RETURNS TABLE (locale text, cabinet_name text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, marketing
  AS $$
    SELECT l.locale, l.cabinet_name FROM marketing.demo_leads l
    WHERE l.access_token_hash = p_access_token_hash AND l.access_expires_at > now()
  $$;

-- Désinscription par le lien d'un e-mail reçu. Idempotente ; false si le lien est inconnu.
CREATE FUNCTION marketing.unsubscribe(p_unsubscribe_token_hash bytea) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, marketing
  AS $$
    WITH target AS (
      SELECT e.lead_id FROM marketing.demo_emails e
      WHERE e.unsubscribe_token_hash = p_unsubscribe_token_hash
    ), updated AS (
      UPDATE marketing.demo_leads l SET unsubscribed_at = coalesce(l.unsubscribed_at, now())
      FROM target WHERE l.id = target.lead_id
      RETURNING l.id
    )
    SELECT EXISTS (SELECT 1 FROM updated)
  $$;

-- Prospect encore éligible à la séquence : ni désinscrit, ni déjà client (un compte existe
-- pour son adresse : l'essai a démarré), et demande de démo de moins de 30 jours.
CREATE FUNCTION marketing.sequence_open(p_lead marketing.demo_leads) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, marketing
  AS $$
    SELECT p_lead.unsubscribed_at IS NULL
      AND p_lead.created_at > now() - interval '30 days'
      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.email = p_lead.email)
  $$;

-- E-mails dus : pour chaque prospect éligible, l'étape suivante si son jour est arrivé et si
-- le précédent e-mail date d'au moins 20 heures (jamais deux e-mails d'affilée).
CREATE FUNCTION marketing.due_demo_emails(p_limit integer)
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
      AND now() >= l.created_at
        + make_interval(days => (marketing.sequence_days())[coalesce(last.step, 0) + 1])
      AND (last.reserved_at IS NULL OR now() >= last.reserved_at + interval '20 hours')
    ORDER BY l.created_at
    LIMIT least(greatest(p_limit, 0), 200)
  $$;

-- Réserve l'étape avant l'envoi. Refuse tout ce qui n'est pas l'étape suivante d'un prospect
-- éligible : deux envois concurrents ne peuvent pas doubler un e-mail.
CREATE FUNCTION marketing.reserve_demo_email(
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
    SELECT coalesce(max(step), 0) INTO v_last FROM marketing.demo_emails WHERE lead_id = p_lead_id;
    IF p_step <> v_last + 1 THEN RETURN false; END IF;
    INSERT INTO marketing.demo_emails (lead_id, step, unsubscribe_token_hash)
    VALUES (p_lead_id, p_step, p_unsubscribe_token_hash);
    RETURN true;
  END $$;

CREATE FUNCTION marketing.mark_demo_email_sent(p_lead_id uuid, p_step smallint) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, marketing
  AS $$
    UPDATE marketing.demo_emails SET sent_at = now()
    WHERE lead_id = p_lead_id AND step = p_step AND sent_at IS NULL
  $$;

-- Échec d'envoi : la réservation non envoyée est libérée pour un prochain passage.
CREATE FUNCTION marketing.release_demo_email(p_lead_id uuid, p_step smallint) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, marketing
  AS $$
    DELETE FROM marketing.demo_emails
    WHERE lead_id = p_lead_id AND step = p_step AND sent_at IS NULL
  $$;

-- Conservation : un prospect est supprimé un an après sa demande (cahier §15).
CREATE FUNCTION marketing.purge_demo_leads() RETURNS integer
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, marketing
  AS $$
    WITH deleted AS (
      DELETE FROM marketing.demo_leads WHERE created_at < now() - interval '1 year' RETURNING 1
    )
    SELECT count(*)::integer FROM deleted
  $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA marketing FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  marketing.capture_demo_lead(text, text, smallint, text, bytea),
  marketing.demo_access(bytea),
  marketing.unsubscribe(bytea),
  marketing.due_demo_emails(integer),
  marketing.reserve_demo_email(uuid, smallint, bytea),
  marketing.mark_demo_email_sent(uuid, smallint),
  marketing.release_demo_email(uuid, smallint),
  marketing.purge_demo_leads(),
  marketing.sequence_days()
TO stivea_app;
