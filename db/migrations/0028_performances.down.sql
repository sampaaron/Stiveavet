-- Retour à une synthèse par suivi : seules les synthèses en français sont gardées. La table
-- est sous RLS forcée : sans `NO FORCE`, la suppression par le migrateur ne ferait rien.
ALTER TABLE followup_syntheses NO FORCE ROW LEVEL SECURITY;
DELETE FROM followup_syntheses WHERE language <> 'fr';
ALTER TABLE followup_syntheses FORCE ROW LEVEL SECURITY;
ALTER TABLE followup_syntheses DROP CONSTRAINT followup_syntheses_pkey;
ALTER TABLE followup_syntheses ADD PRIMARY KEY (followup_id);
ALTER TABLE followup_syntheses DROP COLUMN language;

DELETE FROM jobs.daily_runs WHERE kind = 'billing.sync';
DROP FUNCTION jobs.plan_billing_syncs();
