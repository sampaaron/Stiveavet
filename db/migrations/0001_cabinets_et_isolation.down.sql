-- Annule 0001. Supprime toutes les données : réservé au local, à la CI et à un retour arrière validé.

DROP TABLE IF EXISTS audit_events, followup_shares, followups, animal_owners, owner_contacts, owners, animals, memberships, users, organizations;
DROP TYPE IF EXISTS triage_level, followup_status, contact_kind, language, species, member_role;
DROP SCHEMA IF EXISTS app CASCADE;
REVOKE USAGE ON SCHEMA public FROM stivea_app;
