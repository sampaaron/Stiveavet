-- Annule 0012. Supprime les observations photo, les créneaux lus sur les captures d'agenda
-- et la permission `agenda.capture` : local, CI ou retour arrière validé.

DROP TABLE agenda_free_slots, photo_observations;
DROP FUNCTION app.check_photo_attachment();
ALTER TABLE attachments DROP COLUMN duration_ms;
ALTER TABLE permissions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE role_permissions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE membership_permissions NO FORCE ROW LEVEL SECURITY;
DELETE FROM membership_permissions WHERE permission = 'agenda.capture';
DELETE FROM role_permissions WHERE permission = 'agenda.capture';
DELETE FROM permissions WHERE key = 'agenda.capture';
ALTER TABLE permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE membership_permissions FORCE ROW LEVEL SECURITY;
