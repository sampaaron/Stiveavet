-- Annule 0021 ; local, CI ou retour arrière validé. Notes et sexe saisis sont perdus.
DROP FUNCTION app.delete_unused_animal(uuid, interval);
DROP INDEX animals_org_name_idx;
ALTER TABLE animals
  DROP COLUMN archived_at,
  DROP COLUMN notes,
  DROP COLUMN neutered,
  DROP COLUMN sex;
