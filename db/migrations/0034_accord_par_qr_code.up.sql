-- 0034 : accord WhatsApp du propriétaire par QR code à l'accueil (ADR 0051).
--
-- Le propriétaire scanne un QR code : WhatsApp s'ouvre vers le numéro du cabinet avec un
-- message prêt, qui porte un code à usage unique. Ce message, envoyé depuis son propre numéro,
-- vaut l'accord préalable (0017) que l'équipe cochait jusque-là à sa place.

-- Numéro public du cabinet, pour le lien du QR code. C'est le numéro WhatsApp Business que les
-- propriétaires reçoivent de toute façon ; seul un libellé masqué s'affiche ailleurs.
ALTER TABLE whatsapp_accounts
  ADD COLUMN display_phone text CHECK (display_phone ~ '^\+[1-9][0-9]{7,14}$');
GRANT UPDATE (display_phone) ON whatsapp_accounts TO stivea_app;

-- Code en cours d'un contact : son empreinte à clé (HMAC, jamais le code), son échéance et le
-- membre qui l'a affiché. Effacé dès qu'il sert ; un nouveau code remplace le précédent.
ALTER TABLE followup_contacts
  ADD COLUMN optin_code_hash text CHECK (optin_code_hash ~ '^[0-9a-f]{64}$'),
  ADD COLUMN optin_code_expires_at timestamptz,
  ADD COLUMN optin_code_by_membership_id uuid,
  ADD CONSTRAINT followup_contacts_optin_code_complete CHECK (
    (optin_code_hash IS NULL) = (optin_code_expires_at IS NULL)
    AND (optin_code_hash IS NULL) = (optin_code_by_membership_id IS NULL)
  ),
  ADD CONSTRAINT followup_contacts_optin_code_member
    FOREIGN KEY (organization_id, optin_code_by_membership_id)
    REFERENCES memberships (organization_id, id);
CREATE UNIQUE INDEX followup_contacts_optin_code_idx
  ON followup_contacts (organization_id, optin_code_hash) WHERE optin_code_hash IS NOT NULL;

GRANT UPDATE (optin_code_hash, optin_code_expires_at, optin_code_by_membership_id)
  ON followup_contacts TO stivea_app;
