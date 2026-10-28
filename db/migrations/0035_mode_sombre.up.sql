-- 0035 : mode d'affichage choisi par la personne (ADR 0052) : clair, sombre ou automatique
-- (celui de l'appareil). Simple préférence, comme la langue (0015) : aucun accès n'en dépend.
ALTER TABLE users
  ADD COLUMN color_mode text NOT NULL DEFAULT 'light'
    CHECK (color_mode IN ('light', 'dark', 'system'));
GRANT UPDATE (color_mode) ON users TO stivea_app;
