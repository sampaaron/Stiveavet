-- 0033 : clés d'accès (WebAuthn) pour déverrouiller une session sans retaper le mot de passe
-- (ADR 0050). Le verrouillage après 40 minutes ne change pas ; seule la façon de reprendre
-- change. Une clé d'accès n'ouvre jamais de session : la connexion garde mot de passe et code.
--
-- Comme en 0002 et 0027 : tables du schéma auth, aucun droit direct pour l'application,
-- fonctions SECURITY DEFINER toujours appelées avec l'empreinte du jeton de la session.

ALTER TYPE login_event_kind ADD VALUE IF NOT EXISTS 'session_unlocked_passkey';

CREATE TABLE auth.passkeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Identifiant de l'authentificateur, en base64url ; unique sur toute la plateforme.
  credential_id text NOT NULL UNIQUE
    CHECK (credential_id ~ '^[A-Za-z0-9_-]+$' AND length(credential_id) BETWEEN 16 AND 1366),
  -- Clé publique COSE : jamais de secret côté serveur.
  public_key bytea NOT NULL CHECK (length(public_key) BETWEEN 16 AND 2048),
  counter bigint NOT NULL DEFAULT 0 CHECK (counter >= 0),
  transports text[] NOT NULL DEFAULT '{}'
    CHECK (transports <@ ARRAY['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb']),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX passkeys_user_idx ON auth.passkeys (user_id) WHERE revoked_at IS NULL;

-- Défi à usage unique, lié à une session et à un geste ; un nouveau défi remplace le précédent.
CREATE TABLE auth.webauthn_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES auth.sessions (id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('register', 'unlock')),
  challenge text NOT NULL CHECK (challenge ~ '^[A-Za-z0-9_-]{32,128}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE UNIQUE INDEX webauthn_challenges_open_idx
  ON auth.webauthn_challenges (session_id, purpose) WHERE consumed_at IS NULL;

-- Session valable (verrouillée ou non) d'un membre actif. Fonction interne, comme
-- auth.session_owner (0027) qui, elle, exige une session déverrouillée.
CREATE FUNCTION auth.valid_session(p_session_hash bytea)
  RETURNS TABLE (session_id uuid, user_id uuid, locked boolean)
  LANGUAGE sql STABLE SET search_path = pg_catalog, public, auth, pg_temp
  AS $$
    SELECT s.id, s.user_id, s.locked_at IS NOT NULL
    FROM auth.sessions s
    JOIN memberships m ON m.id = s.membership_id
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = p_session_hash AND s.revoked_at IS NULL AND s.expires_at > now()
      AND m.deactivated_at IS NULL AND u.disabled_at IS NULL
  $$;

-- Clés d'accès de la personne, pour « Mon compte » (session déverrouillée).
CREATE FUNCTION auth.account_passkeys(p_session_hash bytea)
  RETURNS TABLE (passkey_id uuid, label text, created_at timestamptz, last_used_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp
  AS $$
    SELECT p.id, p.label, p.created_at, p.last_used_at
    FROM auth.passkeys p
    WHERE p.user_id = auth.session_owner(p_session_hash) AND p.revoked_at IS NULL
    ORDER BY p.created_at
  $$;

-- Clés publiques de la personne d'une session valable, verrouillée comprise : de quoi
-- préparer et vérifier le déverrouillage. Rien de secret n'en sort.
CREATE FUNCTION auth.session_passkeys(p_session_hash bytea)
  RETURNS TABLE (credential_id text, public_key bytea, counter bigint, transports text[])
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp
  AS $$
    SELECT p.credential_id, p.public_key, p.counter, p.transports
    FROM auth.passkeys p
    WHERE p.user_id = (SELECT v.user_id FROM auth.valid_session(p_session_hash) v)
      AND p.revoked_at IS NULL
    ORDER BY p.created_at
  $$;

-- Nouveau défi : enregistrer une clé exige une session déverrouillée, déverrouiller une
-- session verrouillée. Faux si la session ne convient pas.
CREATE FUNCTION auth.create_webauthn_challenge(
  p_session_hash bytea, p_purpose text, p_challenge text, p_lifetime interval
) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp
  AS $$
  DECLARE
    v_session uuid;
    v_locked boolean;
  BEGIN
    SELECT v.session_id, v.locked INTO v_session, v_locked
    FROM auth.valid_session(p_session_hash) v;
    IF v_session IS NULL OR v_locked <> (p_purpose = 'unlock') THEN RETURN false; END IF;
    UPDATE auth.webauthn_challenges SET consumed_at = now()
    WHERE session_id = v_session AND purpose = p_purpose AND consumed_at IS NULL;
    INSERT INTO auth.webauthn_challenges (session_id, purpose, challenge, expires_at)
    VALUES (v_session, p_purpose, p_challenge, now() + p_lifetime);
    RETURN true;
  END $$;

-- Consomme le défi en cours de la session pour ce geste ; aucune ligne s'il est absent,
-- expiré ou déjà utilisé. Une réponse rejouée ne trouve donc plus rien.
CREATE FUNCTION auth.consume_webauthn_challenge(p_session_hash bytea, p_purpose text)
  RETURNS text
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp
  AS $$
    UPDATE auth.webauthn_challenges c SET consumed_at = now()
    FROM auth.valid_session(p_session_hash) v
    WHERE c.session_id = v.session_id AND c.purpose = p_purpose AND c.consumed_at IS NULL
      AND c.expires_at > now()
    RETURNING c.challenge
  $$;

-- Enregistre une clé vérifiée par l'application (session déverrouillée). Au plus
-- p_max clés actives par personne : null au-delà.
CREATE FUNCTION auth.add_passkey(
  p_session_hash bytea, p_credential_id text, p_public_key bytea, p_counter bigint,
  p_transports text[], p_label text, p_max integer
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp
  AS $$
  DECLARE
    v_user uuid := auth.session_owner(p_session_hash);
    v_id uuid;
  BEGIN
    IF v_user IS NULL THEN RETURN NULL; END IF;
    -- Une personne à la fois : deux ajouts simultanés ne dépassent pas la limite.
    PERFORM pg_advisory_xact_lock(hashtext('passkeys:' || v_user::text));
    IF (SELECT count(*) FROM auth.passkeys WHERE user_id = v_user AND revoked_at IS NULL)
      >= p_max THEN
      RETURN NULL;
    END IF;
    INSERT INTO auth.passkeys (user_id, credential_id, public_key, counter, transports, label)
    VALUES (v_user, p_credential_id, p_public_key, p_counter, p_transports, btrim(p_label))
    RETURNING id INTO v_id;
    RETURN v_id;
  END $$;

CREATE FUNCTION auth.remove_passkey(p_session_hash bytea, p_passkey_id uuid) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp
  AS $$
    UPDATE auth.passkeys p SET revoked_at = now()
    WHERE p.id = p_passkey_id AND p.user_id = auth.session_owner(p_session_hash)
      AND p.revoked_at IS NULL
    RETURNING true
  $$;

-- Après une signature vérifiée : avance le compteur de l'authentificateur. Un compteur qui
-- ne progresse pas (clé copiée, réponse rejouée) est refusé, sauf pour les clés qui n'en
-- tiennent pas (toujours 0).
CREATE FUNCTION auth.use_passkey(p_session_hash bytea, p_credential_id text, p_counter bigint)
  RETURNS boolean
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp
  AS $$
    UPDATE auth.passkeys p SET counter = p_counter, last_used_at = now()
    WHERE p.credential_id = p_credential_id AND p.revoked_at IS NULL
      AND p.user_id = (SELECT v.user_id FROM auth.valid_session(p_session_hash) v)
      AND (p_counter > p.counter OR (p_counter = 0 AND p.counter = 0))
    RETURNING true
  $$;

-- Comme en 0026, plus les défis échus et les clés retirées depuis 30 jours.
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

REVOKE ALL ON FUNCTION
  auth.valid_session(bytea),
  auth.account_passkeys(bytea),
  auth.session_passkeys(bytea),
  auth.create_webauthn_challenge(bytea, text, text, interval),
  auth.consume_webauthn_challenge(bytea, text),
  auth.add_passkey(bytea, text, bytea, bigint, text[], text, integer),
  auth.remove_passkey(bytea, uuid),
  auth.use_passkey(bytea, text, bigint)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  auth.account_passkeys(bytea),
  auth.session_passkeys(bytea),
  auth.create_webauthn_challenge(bytea, text, text, interval),
  auth.consume_webauthn_challenge(bytea, text),
  auth.add_passkey(bytea, text, bytea, bigint, text[], text, integer),
  auth.remove_passkey(bytea, uuid),
  auth.use_passkey(bytea, text, bigint)
TO stivea_app;
