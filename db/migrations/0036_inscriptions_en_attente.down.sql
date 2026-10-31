-- Annule 0036 ; local, CI ou retour arrière validé. Les inscriptions en attente sont perdues :
-- leurs auteurs recommencent l'inscription.
DROP FUNCTION auth.verify_pending_signup(bytea, bytea, integer);
DROP FUNCTION auth.create_pending_signup(bytea, bytea, text, text, text, subscription_plan, text, language, text, interval);

-- auth.purge_expired, comme en 0033.
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
    DELETE FROM auth.rate_limits WHERE window_started_at < now() - interval '1 day';
    GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
    DELETE FROM public.login_events WHERE occurred_at < now() - interval '12 months';
    GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
    RETURN removed;
  END $$;

DROP TABLE auth.pending_signups;
