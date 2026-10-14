-- Annule 0020 ; local, CI ou retour arrière validé. Les appareils retirés le restent.
DROP FUNCTION auth.release_rate_limit(text);

CREATE OR REPLACE FUNCTION auth.reset_password(p_token_hash bytea, p_password_hash text)
  RETURNS TABLE (user_id uuid, email text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, auth
  AS $$
  DECLARE
    v_user uuid;
    v_email text;
  BEGIN
    UPDATE auth.password_resets r SET used_at = now()
    FROM users u
    WHERE r.token_hash = p_token_hash AND r.used_at IS NULL AND r.expires_at > now()
      AND u.id = r.user_id AND u.disabled_at IS NULL
    RETURNING r.user_id, u.email INTO v_user, v_email;
    IF v_user IS NULL THEN RETURN; END IF;

    INSERT INTO auth.credentials (user_id, password_hash) VALUES (v_user, p_password_hash)
    ON CONFLICT ON CONSTRAINT credentials_pkey DO UPDATE
      SET password_hash = EXCLUDED.password_hash, changed_at = now();
    UPDATE auth.sessions s SET revoked_at = now() WHERE s.user_id = v_user AND s.revoked_at IS NULL;
    UPDATE auth.login_challenges c SET consumed_at = now() WHERE c.user_id = v_user AND c.consumed_at IS NULL;
    RETURN QUERY SELECT v_user, v_email;
  END $$;
