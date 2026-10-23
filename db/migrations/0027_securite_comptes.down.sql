-- Annule 0027 ; local, CI ou retour arrière validé. Les sessions fermées le restent.
DROP FUNCTION auth.password_reset_owner(bytea);
DROP FUNCTION auth.revoke_membership_sessions(uuid);
DROP FUNCTION auth.change_password(bytea, text);
DROP FUNCTION auth.revoke_trusted_device(bytea, uuid);
DROP FUNCTION auth.account_trusted_devices(bytea, bytea);
DROP FUNCTION auth.revoke_other_sessions(bytea);
DROP FUNCTION auth.account_sessions(bytea);
DROP FUNCTION auth.session_owner(bytea);

CREATE OR REPLACE FUNCTION auth.invitation_for_token(p_token_hash bytea)
  RETURNS TABLE (
    invitation_id uuid, organization_id uuid, organization_name text, email text,
    display_name text, role member_role, email_registered boolean
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
  AS $$
    SELECT i.id, i.organization_id, o.name, i.email, i.display_name, i.role,
      EXISTS (SELECT 1 FROM users u WHERE u.email = i.email)
    FROM invitations i JOIN organizations o ON o.id = i.organization_id
    WHERE i.token_hash = p_token_hash AND i.accepted_at IS NULL AND i.revoked_at IS NULL
      AND i.expires_at > now()
  $$;

DROP FUNCTION auth.trust_device(bytea, uuid, interval, text);
CREATE FUNCTION auth.trust_device(p_token_hash bytea, p_user_id uuid, p_lifetime interval)
  RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp
  AS $$
    INSERT INTO auth.trusted_devices (token_hash, user_id, expires_at)
    VALUES (p_token_hash, p_user_id, now() + p_lifetime)
  $$;

DROP FUNCTION auth.create_session(bytea, uuid, uuid, interval, text);
CREATE FUNCTION auth.create_session(
  p_token_hash bytea, p_user_id uuid, p_membership_id uuid, p_lifetime interval
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp
  AS $$
  DECLARE
    v_org uuid;
    v_id uuid;
  BEGIN
    SELECT m.organization_id INTO v_org
    FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.id = p_membership_id AND m.user_id = p_user_id
      AND m.deactivated_at IS NULL AND u.disabled_at IS NULL;
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'appartenance inactive' USING ERRCODE = 'insufficient_privilege';
    END IF;
    INSERT INTO auth.sessions (token_hash, user_id, organization_id, membership_id, expires_at)
    VALUES (p_token_hash, p_user_id, v_org, p_membership_id, now() + p_lifetime)
    RETURNING id INTO v_id;
    RETURN v_id;
  END $$;

REVOKE ALL ON FUNCTION
  auth.create_session(bytea, uuid, uuid, interval),
  auth.trust_device(bytea, uuid, interval)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  auth.create_session(bytea, uuid, uuid, interval),
  auth.trust_device(bytea, uuid, interval)
TO stivea_app;

ALTER TABLE auth.trusted_devices DROP COLUMN device_label;
ALTER TABLE auth.sessions DROP COLUMN device_label;
