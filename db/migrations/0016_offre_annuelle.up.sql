-- 0016 : offre d'engagement annuel à 45 jours d'essai (décision d'Aaron du 8 octobre 2026,
-- ADR 0023).
--
-- L'engagement peut désormais être choisi pendant l'essai, à partir du 45e jour, mais il ne
-- commence jamais avant la fin de l'essai : ses 12 mois finissent au plus tôt 14 mois après
-- le début de l'abonnement. Le choix reste explicite (aucune bascule automatique).

CREATE OR REPLACE FUNCTION app.check_subscription_change() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF NEW.started_at <> OLD.started_at THEN
      RAISE EXCEPTION 'le début de l''abonnement ne change pas' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.cycle = 'annual' AND OLD.cycle = 'monthly' THEN
      IF NEW.cycle_chosen_at < OLD.started_at + interval '45 days' THEN
        RAISE EXCEPTION 'engagement annuel proposé à partir du 45e jour' USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.annual_ends_at < OLD.started_at + interval '14 months' THEN
        RAISE EXCEPTION 'pas d''engagement annuel pendant l''essai' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END $$;
