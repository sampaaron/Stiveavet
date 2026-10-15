-- Annule 0022 ; local, CI ou retour arrière validé. Premium redevient Clinique.
ALTER TYPE subscription_plan RENAME TO subscription_plan_0022;
CREATE TYPE subscription_plan AS ENUM ('solo', 'solo_pro', 'clinic', 'clinic_pro');
ALTER TABLE subscriptions
  ALTER COLUMN plan TYPE subscription_plan USING (
    CASE plan::text
      WHEN 'starter' THEN 'solo'
      WHEN 'pro' THEN 'solo_pro'
      ELSE 'clinic'
    END
  )::subscription_plan;
DROP TYPE subscription_plan_0022;
