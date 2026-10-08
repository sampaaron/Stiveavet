-- 0019 : prélèvements SEPA par Stripe (phase 3, lot 24, ADR 0027).
--
-- Stivea Vet reste l'auteur des factures ; Stripe prélève chacune sur le mandat du cabinet.
-- Aucun IBAN : seuls les identifiants Stripe du client, du moyen de paiement et du mandat.

-- Un prélèvement SEPA prend plusieurs jours : la facture est « en cours » entre l'envoi et
-- l'événement de Stripe. Le journal des paiements note l'envoi et les contestations.
ALTER TYPE invoice_status ADD VALUE 'processing';
ALTER TYPE payment_event_kind ADD VALUE 'submitted';
ALTER TYPE payment_event_kind ADD VALUE 'disputed';

-- Référence simulée ou paiement Stripe ; une même opération a un envoi, puis une issue.
ALTER TABLE payment_events
  DROP CONSTRAINT payment_events_provider_ref_check,
  ADD CONSTRAINT payment_events_provider_ref_check
    CHECK (provider_ref ~ '^sim_[a-z0-9_]{4,64}$' OR provider_ref ~ '^pi_[A-Za-z0-9]{8,64}$'),
  DROP CONSTRAINT payment_events_organization_id_provider_ref_key,
  ADD CONSTRAINT payment_events_provider_ref_kind_key UNIQUE (organization_id, provider_ref, kind);
CREATE INDEX payment_events_provider_ref_idx ON payment_events (provider_ref);

-- Une facture payée ne change plus, sauf une contestation bancaire (8 semaines en SEPA),
-- qui la repasse en refusée.
CREATE OR REPLACE FUNCTION app.invoice_status_only() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF (NEW.organization_id, NEW.number, NEW.subscription_month, NEW.period_start, NEW.period_end,
        NEW.lines, NEW.subtotal_cents, NEW.vat_cents, NEW.total_cents, NEW.issued_at)
       IS DISTINCT FROM
       (OLD.organization_id, OLD.number, OLD.subscription_month, OLD.period_start, OLD.period_end,
        OLD.lines, OLD.subtotal_cents, OLD.vat_cents, OLD.total_cents, OLD.issued_at) THEN
      RAISE EXCEPTION 'une facture émise ne se modifie pas' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF OLD.status = 'paid' AND NEW.status::text <> 'failed' THEN
      RAISE EXCEPTION 'une facture payée ne change plus' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END $$;

-- Compte Stripe du cabinet : client, puis moyen de paiement et mandat une fois signés.
CREATE TABLE billing_accounts (
  organization_id uuid PRIMARY KEY REFERENCES organizations (id),
  stripe_customer_id text NOT NULL UNIQUE CHECK (stripe_customer_id ~ '^cus_[A-Za-z0-9]{6,64}$'),
  payment_method_id text CHECK (payment_method_id ~ '^pm_[A-Za-z0-9]{6,64}$'),
  mandate_id text UNIQUE CHECK (mandate_id ~ '^mandate_[A-Za-z0-9]{6,64}$'),
  -- Membre qui a ouvert la page de signature : auteur de la connexion du mandat.
  requested_by_membership_id uuid REFERENCES memberships (id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((payment_method_id IS NULL) = (mandate_id IS NULL))
);
CREATE TRIGGER billing_accounts_touch BEFORE UPDATE ON billing_accounts
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

ALTER TABLE billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON billing_accounts
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
GRANT SELECT, INSERT, UPDATE (payment_method_id, mandate_id, requested_by_membership_id)
  ON billing_accounts TO stivea_app;

ALTER TABLE integration_connections DROP CONSTRAINT integration_connections_mode_check;
ALTER TABLE integration_connections
  ADD CONSTRAINT integration_connections_mode_check
  CHECK (mode = 'simulated' OR (mode = 'live' AND provider IN ('whatsapp', 'payment_mandate')));

ALTER TABLE webhook_events DROP CONSTRAINT webhook_events_provider_check;
ALTER TABLE webhook_events
  ADD CONSTRAINT webhook_events_provider_check CHECK (provider IN ('whatsapp', 'stripe'));

-- Un événement Stripe arrive sans cabinet : seule cette fonction le relie au cabinet, par un
-- identifiant Stripe déjà enregistré, et ne renvoie que l'identifiant du cabinet.
CREATE POLICY webhook_routing ON billing_accounts FOR SELECT TO stivea_migrator USING (true);
CREATE POLICY webhook_routing ON payment_events FOR SELECT TO stivea_migrator USING (true);
CREATE FUNCTION app.stripe_organization(p_kind text, p_ref text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
  AS $$
    SELECT CASE p_kind
      WHEN 'customer' THEN
        (SELECT organization_id FROM billing_accounts
         WHERE p_ref ~ '^cus_[A-Za-z0-9]{6,64}$' AND stripe_customer_id = p_ref)
      WHEN 'mandate' THEN
        (SELECT organization_id FROM billing_accounts
         WHERE p_ref ~ '^mandate_[A-Za-z0-9]{6,64}$' AND mandate_id = p_ref)
      WHEN 'payment' THEN
        (SELECT organization_id FROM payment_events
         WHERE p_ref ~ '^pi_[A-Za-z0-9]{8,64}$' AND provider_ref = p_ref LIMIT 1)
    END
  $$;
REVOKE ALL ON FUNCTION app.stripe_organization(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.stripe_organization(text, text) TO stivea_app;
