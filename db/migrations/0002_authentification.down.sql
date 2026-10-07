-- Annule 0002. Supprime sessions, mots de passe et journal de connexion : local, CI ou retour arrière validé.

DROP TABLE login_events;
DROP SCHEMA auth CASCADE;
DROP POLICY auth_lookup ON memberships;
DROP POLICY auth_lookup ON users;
DROP TYPE login_event_kind;
