-- 0027 : sécurité des comptes (audit du 23 octobre 2026, ADR 0039).
--
-- 1. Sessions et appareils de confiance portent un libellé court (navigateur et système, sans
--    version), affiché dans « Sécurité du compte ».
-- 2. « Sécurité du compte » : chaque fonction part du jeton de la session courante, jamais d'un
--    identifiant de personne choisi par l'application. Une session verrouillée, expirée ou d'un
--    membre retiré n'y donne accès à rien.
-- 3. Départ d'un membre : ses sessions sont fermées pour de bon (avant : seulement refusées tant
--    que l'accès restait retiré) ; une invitation dont l'auteur a quitté le cabinet ne vaut plus.
-- 4. Nouveau mot de passe depuis un lien : adresse et nom du titulaire, pour refuser un mot de
--    passe qui les contient.

ALTER TABLE auth.sessions ADD COLUMN device_label text CHECK (length(device_label) <= 60);
ALTER TABLE auth.trusted_devices ADD COLUMN device_label text CHECK (length(device_label) <= 60);

DROP FUNCTION auth.create_session(bytea, uuid, uuid, interval);
CREATE FUNCTION auth.create_session(
  p_token_hash bytea, p_user_id uuid, p_membership_id uuid, p_lifetime interval, p_device_label text
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
    INSERT INTO auth.sessions (token_hash, user_id, organization_id, membership_id, expires_at, device_label)
    VALUES (p_token_hash, p_user_id, v_org, p_membership_id, now() + p_lifetime, left(p_device_label, 60))
    RETURNING id INTO v_id;
    RETURN v_id;
  END $$;

DROP FUNCTION auth.trust_device(bytea, uuid, interval);
CREATE FUNCTION auth.trust_device(
  p_token_hash bytea, p_user_id uuid, p_lifetime interval, p_device_label text
) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp
  AS $$
    INSERT INTO auth.trusted_devices (token_hash, user_id, expires_at, device_label)
    VALUES (p_token_hash, p_user_id, now() + p_lifetime, left(p_device_label, 60))
  $$;

-- Personne d'une session active et déverrouillée, d'un membre actif. Fonction interne : seules
-- les fonctions ci-dessous l'appellent, l'application n'y a pas accès.
CREATE FUNCTION auth.session_owner(p_session_hash bytea) RETURNS uuid
  LANGUAGE sql STABLE SET search_path = pg_catalog, public, auth, pg_temp
  AS $$
    SELECT s.user_id
    FROM auth.sessions s
    JOIN memberships m ON m.id = s.membership_id
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = p_session_hash AND s.revoked_at IS NULL AND s.locked_at IS NULL
      AND s.expires_at > now() AND m.deactivated_at IS NULL AND u.disabled_at IS NULL
  $$;

-- Sessions ouvertes de la personne, la session courante en premier.
CREATE FUNCTION auth.account_sessions(p_session_hash bytea)
  RETURNS TABLE (
    session_id uuid, device_label text, created_at timestamptz, last_activity_at timestamptz,
    current boolean
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp
  AS $$
    SELECT s.id, s.device_label, s.created_at, s.last_activity_at, s.token_hash = p_session_hash
    FROM auth.sessions s
    WHERE s.user_id = auth.session_owner(p_session_hash)
      AND s.revoked_at IS NULL AND s.expires_at > now()
    ORDER BY s.token_hash = p_session_hash DESC, s.last_activity_at DESC
  $$;

-- Ferme toutes les autres sessions de la personne ; renvoie leur nombre.
CREATE FUNCTION auth.revoke_other_sessions(p_session_hash bytea) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp
  AS $$
  DECLARE
    v_user uuid := auth.session_owner(p_session_hash);
    v_count integer;
  BEGIN
    IF v_user IS NULL THEN RETURN 0; END IF;
    UPDATE auth.sessions s SET revoked_at = now()
    WHERE s.user_id = v_user AND s.token_hash <> p_session_hash AND s.revoked_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
  END $$;

-- Appareils de confiance valables de la personne ; `current` : celui du cookie présenté.
CREATE FUNCTION auth.account_trusted_devices(p_session_hash bytea, p_device_hash bytea)
  RETURNS TABLE (
    device_id uuid, device_label text, created_at timestamptz, last_used_at timestamptz,
    expires_at timestamptz, current boolean
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp
  AS $$
    SELECT d.id, d.device_label, d.created_at, d.last_used_at, d.expires_at,
      d.token_hash IS NOT DISTINCT FROM p_device_hash
    FROM auth.trusted_devices d
    WHERE d.user_id = auth.session_owner(p_session_hash)
      AND d.revoked_at IS NULL AND d.expires_at > now()
    ORDER BY d.last_used_at DESC
  $$;

-- Retire un appareil de confiance de la personne : le code e-mail y sera de nouveau demandé.
CREATE FUNCTION auth.revoke_trusted_device(p_session_hash bytea, p_device_id uuid) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp
  AS $$
    UPDATE auth.trusted_devices d SET revoked_at = now()
    WHERE d.id = p_device_id AND d.user_id = auth.session_owner(p_session_hash)
      AND d.revoked_at IS NULL
    RETURNING true
  $$;

-- Nouveau mot de passe choisi depuis l'espace (ancien vérifié par l'application) : les autres
-- sessions, les liens de réinitialisation et les codes en cours tombent. Renvoie la personne et
-- son adresse (pour l'avertir), ou aucune ligne.
CREATE FUNCTION auth.change_password(p_session_hash bytea, p_password_hash text)
  RETURNS TABLE (user_id uuid, email text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp
  AS $$
  DECLARE
    v_user uuid := auth.session_owner(p_session_hash);
  BEGIN
    IF v_user IS NULL THEN RETURN; END IF;
    UPDATE auth.credentials c SET password_hash = p_password_hash, changed_at = now()
    WHERE c.user_id = v_user;
    UPDATE auth.sessions s SET revoked_at = now()
    WHERE s.user_id = v_user AND s.token_hash <> p_session_hash AND s.revoked_at IS NULL;
    UPDATE auth.password_resets r SET used_at = now() WHERE r.user_id = v_user AND r.used_at IS NULL;
    UPDATE auth.login_challenges c SET consumed_at = now()
    WHERE c.user_id = v_user AND c.consumed_at IS NULL;
    RETURN QUERY SELECT u.id, u.email FROM users u WHERE u.id = v_user;
  END $$;

-- Ferme les sessions d'un membre retiré du cabinet courant (et de lui seul).
CREATE FUNCTION auth.revoke_membership_sessions(p_membership_id uuid) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp
  AS $$
  DECLARE
    v_count integer;
  BEGIN
    UPDATE auth.sessions s SET revoked_at = now()
    FROM memberships m
    WHERE s.membership_id = p_membership_id AND s.revoked_at IS NULL
      AND m.id = s.membership_id AND m.organization_id = app.current_organization_id()
      AND m.deactivated_at IS NOT NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
  END $$;

-- Titulaire d'un lien de réinitialisation encore valable.
CREATE FUNCTION auth.password_reset_owner(p_token_hash bytea)
  RETURNS TABLE (email text, display_name text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp
  AS $$
    SELECT u.email, u.display_name
    FROM auth.password_resets r JOIN users u ON u.id = r.user_id
    WHERE r.token_hash = p_token_hash AND r.used_at IS NULL AND r.expires_at > now()
      AND u.disabled_at IS NULL
  $$;

-- Invitation valable : son auteur doit être encore membre actif du cabinet.
CREATE OR REPLACE FUNCTION auth.invitation_for_token(p_token_hash bytea)
  RETURNS TABLE (
    invitation_id uuid, organization_id uuid, organization_name text, email text,
    display_name text, role member_role, email_registered boolean
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
  AS $$
    SELECT i.id, i.organization_id, o.name, i.email, i.display_name, i.role,
      EXISTS (SELECT 1 FROM users u WHERE u.email = i.email)
    FROM invitations i
    JOIN organizations o ON o.id = i.organization_id
    JOIN memberships inviter ON inviter.organization_id = i.organization_id
      AND inviter.id = i.invited_by_membership_id AND inviter.deactivated_at IS NULL
    JOIN users author ON author.id = inviter.user_id AND author.disabled_at IS NULL
    WHERE i.token_hash = p_token_hash AND i.accepted_at IS NULL AND i.revoked_at IS NULL
      AND i.expires_at > now()
  $$;

REVOKE ALL ON FUNCTION
  auth.create_session(bytea, uuid, uuid, interval, text),
  auth.trust_device(bytea, uuid, interval, text),
  auth.session_owner(bytea),
  auth.account_sessions(bytea),
  auth.revoke_other_sessions(bytea),
  auth.account_trusted_devices(bytea, bytea),
  auth.revoke_trusted_device(bytea, uuid),
  auth.change_password(bytea, text),
  auth.revoke_membership_sessions(uuid),
  auth.password_reset_owner(bytea)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  auth.create_session(bytea, uuid, uuid, interval, text),
  auth.trust_device(bytea, uuid, interval, text),
  auth.account_sessions(bytea),
  auth.revoke_other_sessions(bytea),
  auth.account_trusted_devices(bytea, bytea),
  auth.revoke_trusted_device(bytea, uuid),
  auth.change_password(bytea, text),
  auth.revoke_membership_sessions(uuid),
  auth.password_reset_owner(bytea)
TO stivea_app;
