-- Annule 0035 ; local, CI ou retour arrière validé. Tout le monde revient au mode clair.
REVOKE UPDATE (color_mode) ON users FROM stivea_app;
ALTER TABLE users DROP COLUMN color_mode;
