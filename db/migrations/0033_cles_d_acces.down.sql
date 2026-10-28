-- Annule 0033 ; local, CI ou retour arrière validé. Les clés d'accès enregistrées sont perdues :
-- chacun reprend son mot de passe. La valeur 'session_unlocked_passkey' du journal de
-- connexion reste (PostgreSQL ne retire pas une valeur d'énumération) ; plus rien ne l'écrit.
DROP FUNCTION auth.use_passkey(bytea, text, bigint);
DROP FUNCTION auth.remove_passkey(bytea, uuid);
DROP FUNCTION auth.add_passkey(bytea, text, bytea, bigint, text[], text, integer);
DROP FUNCTION auth.consume_webauthn_challenge(bytea, text);
DROP FUNCTION auth.create_webauthn_challenge(bytea, text, text, interval);
DROP FUNCTION auth.session_passkeys(bytea);
DROP FUNCTION auth.account_passkeys(bytea);
DROP FUNCTION auth.valid_session(bytea);
DROP TABLE auth.webauthn_challenges;
DROP TABLE auth.passkeys;

-- auth.purge_expired, comme en 0026.
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
    DELETE FROM auth.rate_limits WHERE window_started_at < now() - interval '1 day';
    GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
    DELETE FROM public.login_events WHERE occurred_at < now() - interval '12 months';
    GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
    RETURN removed;
  END $$;
