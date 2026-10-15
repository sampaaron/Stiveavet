-- 0022 : offres Starter, Pro et Premium (MVP, ADR 0031).
--
-- Les quatre formules (Solo, Solo Pro, Clinique, Clinique Pro) deviennent trois offres :
-- Solo → Starter, Solo Pro → Pro, Clinique et Clinique Pro → Premium. Les prix, places et
-- quotas vivent dans le catalogue de l'application (`facturation/rules.ts`) ; la base ne
-- connaît que le nom de l'offre. Les factures déjà émises ne changent pas.

ALTER TYPE subscription_plan RENAME TO subscription_plan_0006;
CREATE TYPE subscription_plan AS ENUM ('starter', 'pro', 'premium');
ALTER TABLE subscriptions
  ALTER COLUMN plan TYPE subscription_plan USING (
    CASE plan::text
      WHEN 'solo' THEN 'starter'
      WHEN 'solo_pro' THEN 'pro'
      ELSE 'premium'
    END
  )::subscription_plan;
DROP TYPE subscription_plan_0006;
