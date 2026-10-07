-- Annule 0003. Supprime permissions, invitations et révocations de partage : local, CI ou retour arrière validé.

DROP FUNCTION auth.invitation_for_token(bytea);
DROP POLICY auth_lookup ON organizations;
DROP TABLE invitations;
ALTER TABLE followup_shares DROP COLUMN revoked_at;
DROP TRIGGER memberships_keep_one_admin ON memberships;
DROP TRIGGER memberships_default_permissions ON memberships;
DROP TABLE membership_permissions;
DROP FUNCTION app.keep_one_admin(), app.apply_default_permissions(), app.check_permission_allowed();
DROP TABLE role_permissions, permissions;
