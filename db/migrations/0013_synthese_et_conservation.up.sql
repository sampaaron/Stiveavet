-- 0013 : synthèse pré-consultation et conservation des données (phase 2, lot 17).
--
-- Cahier des charges §9 : une synthèse pré-consultation apparaît à l'ouverture du dossier.
-- Elle est préparée par la passerelle IA (simulée en phase 2) puis gardée ici, avec l'empreinte
-- des échanges qu'elle couvre : elle n'est refaite que si un message, une transcription, une
-- observation ou un triage s'est ajouté depuis.
--
-- Cahier des charges §15 et architecture §12 : l'historique identifiable n'est pas gardé
-- au-delà d'un an. Un suivi terminé est effacé un an après sa fin ; un suivi jamais terminé,
-- quinze mois après sa création (90 jours de suivi au plus, puis un an : plafond de 0008).
-- Seules des statistiques anonymisées demeurent, sans lien avec le cabinet, l'animal ou le
-- propriétaire. L'effacement passe par une seule fonction, qui vérifie elle-même l'échéance
-- avec l'horloge de la base : l'application ne peut plus effacer un suivi directement.

-- Synthèse pré-consultation -------------------------------------------------------------

CREATE TABLE followup_syntheses (
  followup_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  -- Contenu clinique : évolution, signaux, questions ouvertes (validé par Zod à la lecture).
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object' AND length(content::text) <= 20000),
  -- Empreinte SHA-256 (hex) des éléments du dossier couverts par la synthèse.
  source_digest text NOT NULL CHECK (source_digest ~ '^[0-9a-f]{64}$'),
  -- Moteur : simulé tant qu'aucun fournisseur n'est validé (ADR 0004).
  engine text NOT NULL DEFAULT 'simulated' CHECK (engine = 'simulated'),
  generated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, followup_id) REFERENCES followups (organization_id, id) ON DELETE CASCADE
);

ALTER TABLE followup_syntheses ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_syntheses FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON followup_syntheses
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
GRANT SELECT, INSERT, UPDATE (content, source_digest, engine, generated_at) ON followup_syntheses TO stivea_app;

-- Statistiques anonymisées ---------------------------------------------------------------
--
-- Schéma à part, comme `marketing` (0007) : ni cabinet, ni suivi, ni animal, ni propriétaire,
-- ni date précise (le mois seulement). Le rôle applicatif n'y a aucun droit : seule la
-- fonction d'effacement y écrit.

CREATE SCHEMA stats;
REVOKE ALL ON SCHEMA stats FROM PUBLIC;

CREATE TABLE stats.followup_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Mois du début du suivi (premier jour du mois), jamais la date exacte.
  started_month date NOT NULL CHECK (extract(day FROM started_month) = 1),
  species text NOT NULL CHECK (species IN ('dog', 'cat')),
  -- Modèle de la bibliothèque dont vient le protocole, ou « personnalise » / « aucun ».
  protocol_kind text NOT NULL CHECK (protocol_kind ~ '^[a-z0-9-]{1,64}$'),
  duration_days integer CHECK (duration_days BETWEEN 0 AND 1000),
  ended_automatically boolean NOT NULL,
  consent_given boolean NOT NULL,
  owner_messages integer NOT NULL CHECK (owner_messages >= 0),
  photos integer NOT NULL CHECK (photos >= 0),
  voice_notes integer NOT NULL CHECK (voice_notes >= 0),
  max_triage text NOT NULL CHECK (max_triage IN ('normal', 'watch', 'urgent')),
  watch_alerts integer NOT NULL CHECK (watch_alerts >= 0),
  urgent_alerts integer NOT NULL CHECK (urgent_alerts >= 0),
  escalated_alerts integer NOT NULL CHECK (escalated_alerts >= 0)
);
REVOKE ALL ON ALL TABLES IN SCHEMA stats FROM PUBLIC;

-- Effacement d'un suivi arrivé à échéance -------------------------------------------------

-- Échéance de conservation d'un suivi, à l'horloge de la base.
CREATE FUNCTION app.followup_purge_due(p_ended_at timestamptz, p_created_at timestamptz)
  RETURNS boolean
  LANGUAGE sql STABLE
  AS $$
    SELECT (p_ended_at IS NOT NULL AND p_ended_at <= now() - interval '1 year')
        OR p_created_at <= now() - interval '15 months'
  $$;

-- Efface un suivi du cabinet courant s'il est arrivé à échéance, après avoir gardé ses
-- statistiques anonymisées (sauf suivi test). Renvoie false s'il n'existe pas (déjà effacé)
-- ou n'est pas encore dû. Les fichiers du stockage objet sont supprimés par l'appelant avant.
-- Effacés avec le suivi : contacts, accords, conversation, pièces jointes et transcriptions,
-- observations, triage, alertes, accusés, alertes envoyées, tâches, fiche, synthèse et
-- rendez-vous ; puis l'animal et les propriétaires qui ne servent plus à aucun suivi.
-- Restent : le journal d'activité (identifiants seulement) et les usages facturés.
CREATE FUNCTION app.purge_followup(p_followup uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app
  AS $$
  DECLARE
    f record;
    owner_ids uuid[];
  BEGIN
    IF app.current_organization_id() IS NULL THEN
      RAISE EXCEPTION 'cabinet requis' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT fu.id, fu.animal_id, fu.status, fu.is_test, fu.started_at, fu.ended_at, fu.created_at,
           a.species::text AS species, coalesce(p.library_key,
             CASE WHEN fu.protocol_version_id IS NULL THEN 'aucun' ELSE 'personnalise' END) AS protocol_kind
      INTO f
      FROM followups fu
      JOIN animals a ON a.id = fu.animal_id
      LEFT JOIN protocol_versions pv ON pv.id = fu.protocol_version_id
      LEFT JOIN protocols p ON p.id = pv.protocol_id
      WHERE fu.id = p_followup AND fu.organization_id = app.current_organization_id()
      FOR UPDATE OF fu;
    IF NOT FOUND OR NOT app.followup_purge_due(f.ended_at, f.created_at) THEN
      RETURN false;
    END IF;

    IF NOT f.is_test AND f.status <> 'draft' THEN
      INSERT INTO stats.followup_outcomes (
        started_month, species, protocol_kind, duration_days, ended_automatically, consent_given,
        owner_messages, photos, voice_notes, max_triage, watch_alerts, urgent_alerts, escalated_alerts
      )
      SELECT
        date_trunc('month', coalesce(f.started_at, f.created_at) AT TIME ZONE 'Europe/Paris')::date,
        f.species,
        f.protocol_kind,
        CASE WHEN f.ended_at IS NOT NULL AND f.started_at IS NOT NULL
          THEN least(greatest(extract(day FROM f.ended_at - f.started_at)::integer, 0), 1000) END,
        EXISTS (SELECT 1 FROM followup_status_events e
                WHERE e.followup_id = f.id AND e.to_status = 'ended' AND e.reason = 'control_date_reached'),
        EXISTS (SELECT 1 FROM consents c WHERE c.followup_id = f.id AND c.state = 'given'),
        (SELECT count(*) FROM messages m WHERE m.followup_id = f.id AND m.author = 'owner'),
        (SELECT count(*) FROM attachments t WHERE t.followup_id = f.id AND t.kind = 'photo'),
        (SELECT count(*) FROM attachments t WHERE t.followup_id = f.id AND t.kind = 'voice'),
        CASE (SELECT max(CASE t.level WHEN 'urgent' THEN 2 WHEN 'watch' THEN 1 ELSE 0 END)
              FROM triage_events t WHERE t.followup_id = f.id)
          WHEN 2 THEN 'urgent' WHEN 1 THEN 'watch' ELSE 'normal' END,
        (SELECT count(*) FROM alerts al WHERE al.followup_id = f.id AND al.level = 'watch'),
        (SELECT count(*) FROM alerts al WHERE al.followup_id = f.id AND al.level = 'urgent'),
        (SELECT count(*) FROM alerts al WHERE al.followup_id = f.id AND al.escalated_at IS NOT NULL);
    END IF;

    SELECT array_agg(DISTINCT x.owner_id) INTO owner_ids FROM (
      SELECT owner_id FROM followup_contacts WHERE followup_id = f.id
      UNION SELECT owner_id FROM animal_owners WHERE animal_id = f.animal_id
    ) x;

    DELETE FROM appointments WHERE followup_id = f.id;
    DELETE FROM outbox_events
      WHERE aggregate_id = f.id OR payload ->> 'followupId' = f.id::text;
    -- Contacts, conversation, fichiers, triage, alertes, tâches, fiche, synthèse : en cascade.
    DELETE FROM followups WHERE id = f.id;

    -- L'animal et ses propriétaires ne restent que s'ils servent encore.
    IF NOT EXISTS (SELECT 1 FROM followups WHERE animal_id = f.animal_id)
       AND NOT EXISTS (SELECT 1 FROM appointments WHERE animal_id = f.animal_id) THEN
      DELETE FROM animals WHERE id = f.animal_id;
    END IF;
    DELETE FROM owners o
      WHERE o.id = ANY (coalesce(owner_ids, '{}'))
        AND NOT EXISTS (SELECT 1 FROM animal_owners ao WHERE ao.owner_id = o.id)
        AND NOT EXISTS (SELECT 1 FROM followup_contacts fc WHERE fc.owner_id = o.id);
    RETURN true;
  END $$;

-- Les usages facturés restent (pièces comptables) : leur identifiant de suivi devient une
-- simple référence. Le lien est vérifié à l'inscription, plus par une clé étrangère.
ALTER TABLE usage_events DROP CONSTRAINT usage_events_organization_id_followup_id_fkey;
CREATE FUNCTION app.check_usage_followup() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM followups f
                   WHERE f.id = NEW.followup_id AND f.organization_id = NEW.organization_id) THEN
      RAISE EXCEPTION 'suivi inconnu' USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
  END $$;
CREATE TRIGGER usage_events_followup_exists BEFORE INSERT ON usage_events
  FOR EACH ROW EXECUTE FUNCTION app.check_usage_followup();

-- Seule la fonction d'effacement supprime un suivi ou un animal.
REVOKE DELETE ON followups, animals FROM stivea_app;

-- Balayage quotidien ----------------------------------------------------------------------
--
-- Le worker appelle `jobs.plan_retention_sweeps()` à chaque passage ; le premier passage de
-- chaque jour (heure de Paris) inscrit une tâche `retention.sweep` par cabinet, qui est
-- ensuite exécutée sous la RLS de ce cabinet. Ne renvoie qu'un nombre.

CREATE TABLE jobs.daily_runs (
  kind text NOT NULL CHECK (kind ~ '^[a-z_]+\.[a-z_]+$'),
  day date NOT NULL,
  planned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, day)
);
REVOKE ALL ON jobs.daily_runs FROM PUBLIC;

CREATE POLICY retention_planner ON organizations FOR SELECT TO stivea_migrator USING (true);

CREATE FUNCTION jobs.plan_retention_sweeps() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, jobs
  AS $$
  DECLARE
    today date := (now() AT TIME ZONE 'Europe/Paris')::date;
    planned integer;
  BEGIN
    INSERT INTO jobs.daily_runs (kind, day) VALUES ('retention.sweep', today)
      ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN
      RETURN 0;
    END IF;
    WITH inserted AS (
      INSERT INTO scheduled_jobs (organization_id, kind, idempotency_key, run_at)
      SELECT o.id, 'retention.sweep', 'retention:' || to_char(today, 'YYYY-MM-DD'), now()
      FROM organizations o
      ON CONFLICT (organization_id, idempotency_key) DO NOTHING
      RETURNING 1
    )
    SELECT count(*)::integer INTO planned FROM inserted;
    RETURN planned;
  END $$;

REVOKE ALL ON FUNCTION app.followup_purge_due(timestamptz, timestamptz), app.purge_followup(uuid),
  app.check_usage_followup(), jobs.plan_retention_sweeps() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.followup_purge_due(timestamptz, timestamptz), app.purge_followup(uuid)
  TO stivea_app;
GRANT EXECUTE ON FUNCTION jobs.plan_retention_sweeps() TO stivea_app;
