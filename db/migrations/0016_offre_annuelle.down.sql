-- Annule 0016 ; local, CI ou retour arrière validé. Les tâches d'offre déjà inscrites restent
-- et ne font rien sans leur exécutant.

CREATE OR REPLACE FUNCTION app.check_subscription_change() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF NEW.started_at <> OLD.started_at THEN
      RAISE EXCEPTION 'le début de l''abonnement ne change pas' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.cycle = 'annual' AND OLD.cycle = 'monthly'
       AND NEW.cycle_chosen_at < OLD.started_at + interval '2 months' THEN
      RAISE EXCEPTION 'pas d''engagement annuel pendant l''essai' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END $$;
