-- 0031 : modèles de réponse du cabinet (ADR 0048).
--
-- Phrases toutes prêtes que l'équipe pose dans la zone de saisie d'un dossier, relit, corrige
-- puis envoie elle-même au propriétaire. Rien ne part sans clic. Ce sont des textes du
-- cabinet, pas des dossiers patients : aucune donnée d'un animal n'y est enregistrée, les
-- noms sont remplacés au moment de poser le texte ({animal}, {proprietaire}, …).

CREATE TABLE reply_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 60 AND title = btrim(title)),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 1000 AND body = btrim(body)),
  language text NOT NULL CHECK (language IN ('fr', 'en')),
  created_by_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, created_by_membership_id)
    REFERENCES memberships (organization_id, id) ON DELETE SET NULL (created_by_membership_id)
);
CREATE INDEX reply_templates_org_idx ON reply_templates (organization_id, language, title);

ALTER TABLE reply_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE reply_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reply_templates
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());

GRANT SELECT, INSERT, DELETE, UPDATE (title, body, language, updated_at)
  ON reply_templates TO stivea_app;
