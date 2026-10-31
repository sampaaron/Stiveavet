-- 0036 : inscription en attente (ADR 0054). Une inscription non confirmée ne crée plus ni
-- cabinet ni personne : elle attend ici son code, quelques minutes, sans réserver l'adresse.
-- Le cabinet n'est créé qu'au bon code, preuve que la personne reçoit bien les e-mails.
CREATE TABLE auth.pending_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash bytea NOT NULL UNIQUE CHECK (length(token_hash) = 32),
  code_hash bytea NOT NULL CHECK (length(code_hash) = 32),
  email text NOT NULL CHECK (email = lower(email) AND email LIKE '%_@_%'),
  organization_name text NOT NULL CHECK (length(organization_name) BETWEEN 2 AND 160),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
  plan subscription_plan NOT NULL,
  password_hash text NOT NULL,
  ui_locale language NOT NULL,
  terms_version text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX pending_signups_expires_idx ON auth.pending_signups (expires_at);

-- Nouvelle inscription en attente ; les inscriptions échues partent au passage.
CREATE FUNCTION auth.create_pending_signup(
  p_token_hash bytea, p_code_hash bytea, p_email text, p_organization_name text,
  p_display_name text, p_plan subscription_plan, p_password_hash text, p_ui_locale language,
  p_terms_version text, p_lifetime interval
) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp
  AS $$
    DELETE FROM auth.pending_signups WHERE expires_at < now();
    INSERT INTO auth.pending_signups (
      token_hash, code_hash, email, organization_name, display_name, plan, password_hash,
      ui_locale, terms_version, expires_at
    ) VALUES (
      p_token_hash, p_code_hash, lower(p_email), p_organization_name, p_display_name, p_plan,
      p_password_hash, p_ui_locale, p_terms_version, now() + p_lifetime
    );
  $$;

-- Comme auth.verify_login_challenge : 'ok' rend l'inscription et l'efface, 'invalid' compte la
-- tentative, 'expired' couvre l'absence, l'échéance et l'excès de tentatives.
CREATE FUNCTION auth.verify_pending_signup(
  p_token_hash bytea, p_code_hash bytea, p_max_attempts integer
) RETURNS TABLE (
  outcome text, email text, organization_name text, display_name text,
  plan subscription_plan, password_hash text, ui_locale language, terms_version text
)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp
  AS $$
  DECLARE
    s auth.pending_signups%ROWTYPE;
  BEGIN
    SELECT * INTO s FROM auth.pending_signups p
    WHERE p.token_hash = p_token_hash AND p.expires_at > now()
    FOR UPDATE;
    IF NOT FOUND OR s.attempts >= p_max_attempts THEN
      RETURN QUERY SELECT 'expired'::text, NULL::text, NULL::text, NULL::text,
        NULL::subscription_plan, NULL::text, NULL::language, NULL::text;
      RETURN;
    END IF;
    IF s.code_hash = p_code_hash THEN
      DELETE FROM auth.pending_signups p WHERE p.id = s.id;
      RETURN QUERY SELECT 'ok'::text, s.email, s.organization_name, s.display_name, s.plan,
        s.password_hash, s.ui_locale, s.terms_version;
    ELSE
      UPDATE auth.pending_signups p SET attempts = p.attempts + 1 WHERE p.id = s.id;
      RETURN QUERY SELECT
        CASE WHEN s.attempts + 1 >= p_max_attempts THEN 'expired' ELSE 'invalid' END,
        NULL::text, NULL::text, NULL::text, NULL::subscription_plan, NULL::text,
        NULL::language, NULL::text;
    END IF;
  END $$;

-- Comme en 0033, plus les inscriptions en attente échues, effacées sans délai.
CREATE OR REPLACE FUNCTION auth.purge_expired() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp
  AS $$
  DECLARE
    horizon timestamptz := now() - interval '30 days';
    removed integer := 0;
    n integer;
  BEGIN
    DELETE FROM auth.sessions WHERE expires_at < horizon OR revoked_at < horizon;
    GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
    DELETE FROM auth.login_challenges WHERE expires_at < horizon;
    GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
    DELETE FROM auth.password_resets WHERE expires_at < horizon;
    GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
    DELETE FROM auth.trusted_devices WHERE expires_at < horizon OR revoked_at < horizon;
    GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
    DELETE FROM auth.webauthn_challenges WHERE expires_at < now() - interval '1 day';
    GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
    DELETE FROM auth.passkeys WHERE revoked_at < horizon;
    GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
    DELETE FROM auth.pending_signups WHERE expires_at < now();
    GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
    DELETE FROM auth.rate_limits WHERE window_started_at < now() - interval '1 day';
    GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
    DELETE FROM public.login_events WHERE occurred_at < now() - interval '12 months';
    GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
    RETURN removed;
  END $$;

REVOKE ALL ON FUNCTION
  auth.create_pending_signup(bytea, bytea, text, text, text, subscription_plan, text, language, text, interval),
  auth.verify_pending_signup(bytea, bytea, integer)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  auth.create_pending_signup(bytea, bytea, text, text, text, subscription_plan, text, language, text, interval),
  auth.verify_pending_signup(bytea, bytea, integer)
TO stivea_app;
