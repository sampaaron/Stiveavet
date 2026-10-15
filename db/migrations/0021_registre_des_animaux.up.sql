-- 0021 : registre des animaux et des propriétaires, saisis à la main (MVP).
--
-- Jusqu'ici, un animal n'entrait dans Stivea Vet que par l'import dr.veto d'un suivi. Le
-- cabinet peut maintenant l'enregistrer lui-même, avec ses propriétaires, puis lancer un
-- suivi depuis sa fiche.
-- 1. Identité complétée (sexe, stérilisation), notes internes et archivage. L'e-mail d'un
--    propriétaire est un contact de type `email` (table `owner_contacts`, déjà prévue).
-- 2. Un animal jamais suivi (créé par erreur, ou resté sans suivi) peut être effacé par le
--    cabinet ; sinon il l'est quinze mois après sa création par le balayage quotidien, comme
--    un suivi jamais terminé (cahier des charges §15). Seule cette fonction l'efface : le rôle
--    applicatif n'a toujours pas le droit DELETE sur `animals` (migration 0013).

ALTER TABLE animals
  ADD COLUMN sex text CHECK (sex IN ('female', 'male')),
  ADD COLUMN neutered boolean,
  ADD COLUMN notes text CHECK (length(notes) <= 2000),
  ADD COLUMN archived_at timestamptz;

CREATE INDEX animals_org_name_idx ON animals (organization_id, lower(name));

-- Efface un animal sans suivi ni rendez-vous, puis ses propriétaires devenus orphelins.
-- `p_min_age` : âge minimal de la fiche (zéro pour un effacement demandé par le cabinet).
CREATE FUNCTION app.delete_unused_animal(p_animal uuid, p_min_age interval)
  RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app
  AS $$
  DECLARE
    owner_ids uuid[];
  BEGIN
    IF app.current_organization_id() IS NULL THEN
      RAISE EXCEPTION 'cabinet requis' USING ERRCODE = 'insufficient_privilege';
    END IF;
    PERFORM 1 FROM animals a
      WHERE a.id = p_animal AND a.organization_id = app.current_organization_id()
        AND a.created_at <= now() - p_min_age
      FOR UPDATE;
    IF NOT FOUND
       OR EXISTS (SELECT 1 FROM followups WHERE animal_id = p_animal)
       OR EXISTS (SELECT 1 FROM appointments WHERE animal_id = p_animal) THEN
      RETURN false;
    END IF;
    SELECT array_agg(owner_id) INTO owner_ids FROM animal_owners WHERE animal_id = p_animal;
    DELETE FROM animals WHERE id = p_animal;
    DELETE FROM owners o
      WHERE o.id = ANY (coalesce(owner_ids, '{}'))
        AND NOT EXISTS (SELECT 1 FROM animal_owners ao WHERE ao.owner_id = o.id)
        AND NOT EXISTS (SELECT 1 FROM followup_contacts fc WHERE fc.owner_id = o.id);
    RETURN true;
  END $$;

REVOKE ALL ON FUNCTION app.delete_unused_animal(uuid, interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.delete_unused_animal(uuid, interval) TO stivea_app;
