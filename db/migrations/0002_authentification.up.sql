-- 0002 : authentification (mots de passe, sessions, codes de sécurité, appareils de confiance,
-- réinitialisation, limitation des tentatives, journal de connexion).
--
-- Règle : le rôle applicatif n'a AUCUN droit sur le schéma auth. Il n'y accède que par les
-- fonctions SECURITY DEFINER ci-dessous, chacune limitée à une opération précise.
-- Les jetons et codes ne sont jamais stockés en clair : seulement leur empreinte SHA-256
-- (32 octets), calculée par l'application.

CREATE SCHEMA auth;
REVOKE ALL ON SCHEMA auth FROM PUBLIC;
GRANT USAGE ON SCHEMA auth TO stivea_app;

CREATE TYPE login_event_kind AS ENUM (
  'login_succeeded',
  'login_failed',
  'login_rate_limited',
  'code_sent',
  'code_failed',
  'session_locked',
  'session_unlocked',
  'unlock_failed',
  'logout',
  'password_reset_requested',
  'password_reset_completed',
  'signup_completed'
);

-- Les fonctions d'authentification (propriété de stivea_migrator) doivent retrouver une
-- personne par son e-mail avant de connaître son cabinet. Ces politiques ne concernent que
-- stivea_migrator ; le rôle applicatif reste soumis aux politiques de 0001.
CREATE POLICY auth_lookup ON users FOR SELECT TO stivea_migrator USING (true);
CREATE POLICY auth_lookup ON memberships FOR SELECT TO stivea_migrator USING (true);

CREATE TABLE auth.credentials (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  password_hash text NOT NULL CHECK (password_hash LIKE '$argon2id$%'),
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash bytea NOT NULL UNIQUE CHECK (length(token_hash) = 32),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  FOREIGN KEY (organization_id, membership_id) REFERENCES memberships (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX sessions_user_idx ON auth.sessions (user_id) WHERE revoked_at IS NULL;

CREATE TABLE auth.trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash bytea NOT NULL UNIQUE CHECK (length(token_hash) = 32),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

-- Code de sécurité à 6 chiffres envoyé par e-mail (vétérinaires, nouvel appareil).
CREATE TABLE auth.login_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash bytea NOT NULL UNIQUE CHECK (length(token_hash) = 32),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code_hash bytea NOT NULL CHECK (length(code_hash) = 32),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE INDEX login_challenges_user_idx ON auth.login_challenges (user_id) WHERE consumed_at IS NULL;

CREATE TABLE auth.password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash bytea NOT NULL UNIQUE CHECK (length(token_hash) = 32),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX password_resets_user_idx ON auth.password_resets (user_id) WHERE used_at IS NULL;

-- Compteurs de tentatives par fenêtre ; la clé est une empreinte (jamais un e-mail ou une IP).
CREATE TABLE auth.rate_limits (
  bucket text PRIMARY KEY CHECK (bucket ~ '^[a-z_]+:[0-9a-f]{64}$'),
  window_started_at timestamptz NOT NULL,
  hits integer NOT NULL CHECK (hits > 0)
);

-- Journal de connexion (ajout seul). Lisible par l'administrateur de son cabinet ;
-- les événements sans cabinet (e-mail inconnu…) ne sont visibles de personne dans l'application.
CREATE TABLE login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations (id),
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  kind login_event_kind NOT NULL,
  -- Empreinte tronquée de l'adresse IP : permet de repérer un nouvel emplacement sans la stocker.
  ip_hash text CHECK (ip_hash ~ '^[0-9a-f]{16}$'),
  user_agent text CHECK (length(user_agent) <= 200),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_events_org_time_idx ON login_events (organization_id, occurred_at DESC);
CREATE INDEX login_events_user_time_idx ON login_events (user_id, occurred_at DESC);
CREATE TRIGGER login_events_append_only BEFORE UPDATE ON login_events
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();

ALTER TABLE login_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON login_events FOR SELECT
  USING (organization_id = app.current_organization_id());
CREATE POLICY auth_record ON login_events FOR INSERT TO stivea_migrator WITH CHECK (true);
GRANT SELECT ON login_events TO stivea_app;

-- Fonctions -------------------------------------------------------------------------
-- Toutes : SECURITY DEFINER, search_path figé, exécutables par stivea_app uniquement.

-- Empreinte du mot de passe d'une personne active, par e-mail (connexion, mot de passe oublié).
CREATE FUNCTION auth.credentials_by_email(p_email text)
  RETURNS TABLE (user_id uuid, password_hash text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, auth
  AS $$
    SELECT u.id, c.password_hash
    FROM users u JOIN auth.credentials c ON c.user_id = u.id
    WHERE u.email = lower(p_email) AND u.disabled_at IS NULL
  $$;

-- Personne existante (active ou non) pour cet e-mail : évite de révéler l'existence d'un compte.
CREATE FUNCTION auth.email_registered(p_email text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
  AS $$ SELECT EXISTS (SELECT 1 FROM users WHERE email = lower(p_email)) $$;

CREATE FUNCTION auth.password_hash_for(p_user_id uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, auth
  AS $$
    SELECT c.password_hash FROM auth.credentials c JOIN users u ON u.id = c.user_id
    WHERE c.user_id = p_user_id AND u.disabled_at IS NULL
  $$;

-- Premier mot de passe d'une personne qui vient d'être créée dans la transaction courante.
CREATE FUNCTION auth.set_initial_password(p_user_id uuid, p_password_hash text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, auth
  AS $$
  BEGIN
    IF p_user_id IS DISTINCT FROM app.current_user_id() THEN
      RAISE EXCEPTION 'personne courante attendue' USING ERRCODE = 'insufficient_privilege';
    END IF;
    INSERT INTO auth.credentials (user_id, password_hash) VALUES (p_user_id, p_password_hash);
  END $$;

-- Cabinets où la personne peut se connecter, du plus ancien au plus récent.
CREATE FUNCTION auth.active_memberships(p_user_id uuid)
  RETURNS TABLE (membership_id uuid, organization_id uuid, role member_role)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
  AS $$
    SELECT m.id, m.organization_id, m.role
    FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.user_id = p_user_id AND m.deactivated_at IS NULL AND u.disabled_at IS NULL
    ORDER BY m.created_at, m.id
  $$;

CREATE FUNCTION auth.create_session(
  p_token_hash bytea, p_user_id uuid, p_membership_id uuid, p_lifetime interval
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, auth
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

-- Lit la session d'un jeton et applique le verrouillage d'inactivité côté serveur.
-- Aucune ligne : session absente, expirée, révoquée, ou compte/appartenance désactivé.
-- Une session verrouillée est renvoyée avec locked = true et n'est pas prolongée.
CREATE FUNCTION auth.resolve_session(p_token_hash bytea, p_idle_timeout interval)
  RETURNS TABLE (
    session_id uuid, user_id uuid, organization_id uuid, membership_id uuid,
    role member_role, locked boolean
  )
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, auth
  AS $$
  DECLARE
    s auth.sessions%ROWTYPE;
    v_role member_role;
  BEGIN
    SELECT * INTO s FROM auth.sessions
    WHERE token_hash = p_token_hash AND revoked_at IS NULL AND expires_at > now()
    FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;

    SELECT m.role INTO v_role
    FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.id = s.membership_id AND m.deactivated_at IS NULL AND u.disabled_at IS NULL;
    IF v_role IS NULL THEN
      UPDATE auth.sessions SET revoked_at = now() WHERE id = s.id;
      RETURN;
    END IF;

    IF s.locked_at IS NULL AND s.last_activity_at < now() - p_idle_timeout THEN
      UPDATE auth.sessions SET locked_at = now() WHERE id = s.id;
      INSERT INTO login_events (organization_id, user_id, kind)
      VALUES (s.organization_id, s.user_id, 'session_locked');
      s.locked_at := now();
    ELSIF s.locked_at IS NULL THEN
      UPDATE auth.sessions SET last_activity_at = now() WHERE id = s.id;
    END IF;

    RETURN QUERY SELECT s.id, s.user_id, s.organization_id, s.membership_id, v_role,
      s.locked_at IS NOT NULL;
  END $$;

CREATE FUNCTION auth.lock_session(p_token_hash bytea) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, auth
  AS $$
    UPDATE auth.sessions SET locked_at = now()
    WHERE token_hash = p_token_hash AND revoked_at IS NULL AND locked_at IS NULL AND expires_at > now()
    RETURNING true
  $$;

-- À n'appeler qu'après vérification du mot de passe par l'application.
CREATE FUNCTION auth.unlock_session(p_token_hash bytea) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, auth
  AS $$
    UPDATE auth.sessions SET locked_at = NULL, last_activity_at = now()
    WHERE token_hash = p_token_hash AND revoked_at IS NULL AND expires_at > now()
    RETURNING true
  $$;

CREATE FUNCTION auth.revoke_session(p_token_hash bytea) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, auth
  AS $$
    UPDATE auth.sessions SET revoked_at = now()
    WHERE token_hash = p_token_hash AND revoked_at IS NULL
    RETURNING true
  $$;

-- Un seul code valide à la fois par personne : tout code précédent est annulé.
CREATE FUNCTION auth.create_login_challenge(
  p_token_hash bytea, p_user_id uuid, p_code_hash bytea, p_lifetime interval
) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, auth
  AS $$
    UPDATE auth.login_challenges SET consumed_at = now()
    WHERE user_id = p_user_id AND consumed_at IS NULL;
    INSERT INTO auth.login_challenges (token_hash, user_id, code_hash, expires_at)
    VALUES (p_token_hash, p_user_id, p_code_hash, now() + p_lifetime);
  $$;

-- Résultat : 'ok' (code consommé), 'invalid' (tentative comptée), 'expired' (absent, expiré,
-- déjà utilisé ou trop de tentatives).
CREATE FUNCTION auth.verify_login_challenge(
  p_token_hash bytea, p_code_hash bytea, p_max_attempts integer
) RETURNS TABLE (outcome text, user_id uuid)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, auth
  AS $$
  DECLARE
    c auth.login_challenges%ROWTYPE;
  BEGIN
    SELECT * INTO c FROM auth.login_challenges
    WHERE token_hash = p_token_hash AND consumed_at IS NULL AND expires_at > now()
    FOR UPDATE;
    IF NOT FOUND OR c.attempts >= p_max_attempts THEN
      RETURN QUERY SELECT 'expired'::text, c.user_id;
      RETURN;
    END IF;
    IF c.code_hash = p_code_hash THEN
      UPDATE auth.login_challenges SET consumed_at = now() WHERE id = c.id;
      RETURN QUERY SELECT 'ok'::text, c.user_id;
    ELSE
      UPDATE auth.login_challenges SET attempts = attempts + 1 WHERE id = c.id;
      RETURN QUERY SELECT
        CASE WHEN c.attempts + 1 >= p_max_attempts THEN 'expired' ELSE 'invalid' END,
        c.user_id;
    END IF;
  END $$;

CREATE FUNCTION auth.trust_device(p_token_hash bytea, p_user_id uuid, p_lifetime interval)
  RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, auth
  AS $$
    INSERT INTO auth.trusted_devices (token_hash, user_id, expires_at)
    VALUES (p_token_hash, p_user_id, now() + p_lifetime)
  $$;

CREATE FUNCTION auth.is_trusted_device(p_token_hash bytea, p_user_id uuid) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, auth
  AS $$
    WITH touched AS (
      UPDATE auth.trusted_devices SET last_used_at = now()
      WHERE token_hash = p_token_hash AND user_id = p_user_id
        AND revoked_at IS NULL AND expires_at > now()
      RETURNING 1
    )
    SELECT EXISTS (SELECT 1 FROM touched)
  $$;

-- Un seul lien de réinitialisation valide à la fois par personne.
CREATE FUNCTION auth.create_password_reset(
  p_token_hash bytea, p_user_id uuid, p_lifetime interval
) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, auth
  AS $$
    UPDATE auth.password_resets SET used_at = now() WHERE user_id = p_user_id AND used_at IS NULL;
    INSERT INTO auth.password_resets (token_hash, user_id, expires_at)
    VALUES (p_token_hash, p_user_id, now() + p_lifetime);
  $$;

-- Lien valide (sans le consommer) : affiche ou non le formulaire.
CREATE FUNCTION auth.password_reset_valid(p_token_hash bytea) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, auth
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM auth.password_resets r JOIN users u ON u.id = r.user_id
      WHERE r.token_hash = p_token_hash AND r.used_at IS NULL AND r.expires_at > now()
        AND u.disabled_at IS NULL
    )
  $$;

-- Consomme le lien, remplace le mot de passe et ferme toutes les sessions de la personne.
-- Renvoie la personne et son adresse (pour l'avertir du changement), ou aucune ligne.
CREATE FUNCTION auth.reset_password(p_token_hash bytea, p_password_hash text)
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

-- Compte une tentative ; renvoie false si la limite de la fenêtre est dépassée.
CREATE FUNCTION auth.hit_rate_limit(p_bucket text, p_window interval, p_max integer)
  RETURNS boolean
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, auth
  AS $$
    INSERT INTO auth.rate_limits AS r (bucket, window_started_at, hits)
    VALUES (p_bucket, now(), 1)
    ON CONFLICT (bucket) DO UPDATE SET
      window_started_at = CASE WHEN r.window_started_at < now() - p_window THEN now() ELSE r.window_started_at END,
      hits = CASE WHEN r.window_started_at < now() - p_window THEN 1 ELSE r.hits + 1 END
    RETURNING hits <= p_max
  $$;

-- Limite déjà atteinte, sans compter de tentative (échecs comptés à part).
CREATE FUNCTION auth.rate_limit_reached(p_bucket text, p_window interval, p_max integer)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, auth
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM auth.rate_limits
      WHERE bucket = p_bucket AND window_started_at >= now() - p_window AND hits >= p_max
    )
  $$;

CREATE FUNCTION auth.record_login_event(
  p_kind login_event_kind, p_user_id uuid, p_organization_id uuid, p_ip_hash text, p_user_agent text
) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public
  AS $$
    INSERT INTO login_events (kind, user_id, organization_id, ip_hash, user_agent)
    VALUES (p_kind, p_user_id, p_organization_id, p_ip_hash, left(p_user_agent, 200))
  $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA auth FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO stivea_app;
