-- 0024 : conversations avec Stive, l'assistant IA interne du vétérinaire (ADR 0035).
--
-- Une conversation appartient à une seule personne : ni ses confrères ni l'administrateur
-- du cabinet ne la lisent. La RLS l'impose en plus du cabinet : une ligne n'est visible
-- que pour le membre du cabinet courant rattaché à la personne courante (`app.user_id`).
-- Un message peut s'appuyer sur un dossier de suivi ; il est effacé avec ce dossier
-- (conservation, cahier des charges §15), et la conversation perd seulement ce lien.

CREATE TABLE stive_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  -- Dernier dossier évoqué, repris au message suivant tant qu'un autre n'est pas cité.
  followup_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, membership_id) REFERENCES memberships (organization_id, id),
  FOREIGN KEY (organization_id, followup_id) REFERENCES followups (organization_id, id)
    ON DELETE SET NULL (followup_id)
);
CREATE INDEX stive_conversations_member_idx
  ON stive_conversations (organization_id, membership_id, updated_at DESC);

CREATE TABLE stive_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  author text NOT NULL CHECK (author IN ('vet', 'stive')),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  -- Dossier sur lequel la réponse s'est appuyée (aucun : null).
  followup_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (organization_id, conversation_id)
    REFERENCES stive_conversations (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, followup_id)
    REFERENCES followups (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX stive_messages_conversation_idx ON stive_messages (conversation_id, created_at);
CREATE INDEX stive_messages_followup_idx ON stive_messages (followup_id) WHERE followup_id IS NOT NULL;

CREATE TRIGGER stive_conversations_touch BEFORE UPDATE ON stive_conversations
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

ALTER TABLE stive_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE stive_conversations FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_only ON stive_conversations
  USING (
    organization_id = app.current_organization_id()
    AND membership_id IN (
      SELECT m.id FROM memberships m
      WHERE m.organization_id = app.current_organization_id()
        AND m.user_id = app.current_user_id()
    )
  )
  WITH CHECK (
    organization_id = app.current_organization_id()
    AND membership_id IN (
      SELECT m.id FROM memberships m
      WHERE m.organization_id = app.current_organization_id()
        AND m.user_id = app.current_user_id()
    )
  );

ALTER TABLE stive_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE stive_messages FORCE ROW LEVEL SECURITY;
-- La conversation parente n'est visible que pour son auteur (politique ci-dessus).
CREATE POLICY owner_only ON stive_messages
  USING (
    organization_id = app.current_organization_id()
    AND conversation_id IN (SELECT c.id FROM stive_conversations c)
  )
  WITH CHECK (
    organization_id = app.current_organization_id()
    AND conversation_id IN (SELECT c.id FROM stive_conversations c)
  );

-- Messages en ajout seul ; la personne peut effacer une conversation entière.
GRANT SELECT, INSERT, DELETE, UPDATE (title, followup_id) ON stive_conversations TO stivea_app;
GRANT SELECT, INSERT, DELETE ON stive_messages TO stivea_app;
