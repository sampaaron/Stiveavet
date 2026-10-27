-- 0029 : documents du cabinet (ADR 0045).
--
-- Bibliothèque de l'équipe, sous l'onglet Protocoles : fiches de consignes remises aux
-- propriétaires, procédures internes, documents administratifs. Pas de dossier patient ici.
-- Comme pour les photos (architecture §7), le fichier va dans le stockage objet privé ; la
-- base ne garde que sa clé, son type lu dans le fichier, sa taille et son empreinte.
-- Un document supprimé quitte le stockage ; sa ligne reste (titre, type, dates) pour la
-- traçabilité, et ne revient jamais. Le journal d'activité garde qui l'a ajouté, ouvert ou
-- supprimé.

CREATE TABLE cabinet_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120 AND title = btrim(title)),
  category text NOT NULL CHECK (category IN ('owner_sheet', 'procedure', 'admin', 'other')),
  -- Clé dans le stockage objet privé (jamais une URL publique).
  storage_key text NOT NULL CHECK (storage_key ~ '^[a-z0-9][a-z0-9/_.-]{7,254}$'),
  -- Type lu dans les premiers octets : PDF ou image, jamais de SVG ni de page web.
  content_type text NOT NULL
    CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 5242880),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  added_by_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Fichier effacé du stockage ; la ligne reste pour la traçabilité.
  deleted_at timestamptz,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, storage_key),
  FOREIGN KEY (organization_id, added_by_membership_id)
    REFERENCES memberships (organization_id, id) ON DELETE SET NULL (added_by_membership_id)
);
CREATE INDEX cabinet_documents_live_idx ON cabinet_documents (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Seule la suppression change une ligne, une seule fois.
CREATE FUNCTION app.check_cabinet_document() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF OLD.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'document déjà supprimé' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END $$;
CREATE TRIGGER cabinet_documents_once BEFORE UPDATE ON cabinet_documents
  FOR EACH ROW EXECUTE FUNCTION app.check_cabinet_document();
REVOKE ALL ON FUNCTION app.check_cabinet_document() FROM PUBLIC;

ALTER TABLE cabinet_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE cabinet_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON cabinet_documents
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());

-- Aucune suppression directe : l'effacement passe par le marquage, une seule fois.
GRANT SELECT, INSERT, UPDATE (deleted_at) ON cabinet_documents TO stivea_app;
