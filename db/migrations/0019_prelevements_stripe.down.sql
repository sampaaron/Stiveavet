-- Annule 0019 ; local, CI ou retour arrière validé. Les comptes Stripe, les prélèvements en
-- cours et les contestations sont perdus ; une facture en cours redevient à prélever.
-- Sous RLS forcée, le rôle de migration ne voit aucune ligne : elle est levée le temps des
-- corrections de données.

DROP FUNCTION app.stripe_organization(text, text);
DROP POLICY webhook_routing ON payment_events;
DROP TABLE billing_accounts;

ALTER TABLE webhook_events NO FORCE ROW LEVEL SECURITY;
DELETE FROM webhook_events WHERE provider = 'stripe';
ALTER TABLE webhook_events FORCE ROW LEVEL SECURITY;
ALTER TABLE webhook_events DROP CONSTRAINT webhook_events_provider_check;
ALTER TABLE webhook_events
  ADD CONSTRAINT webhook_events_provider_check CHECK (provider IN ('whatsapp'));

ALTER TABLE integration_connections NO FORCE ROW LEVEL SECURITY;
DELETE FROM integration_connections WHERE mode = 'live' AND provider = 'payment_mandate';
ALTER TABLE integration_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE integration_connections DROP CONSTRAINT integration_connections_mode_check;
ALTER TABLE integration_connections
  ADD CONSTRAINT integration_connections_mode_check
  CHECK (mode = 'simulated' OR (mode = 'live' AND provider = 'whatsapp'));

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
    IF OLD.status = 'paid' THEN
      RAISE EXCEPTION 'une facture payée ne change plus' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END $$;

-- Une valeur d'énumération ne se retire pas : les types sont recréés sans elles.
ALTER TABLE payment_events NO FORCE ROW LEVEL SECURITY;
DELETE FROM payment_events WHERE kind IN ('submitted', 'disputed') OR provider_ref !~ '^sim_';
ALTER TABLE payment_events FORCE ROW LEVEL SECURITY;
DROP INDEX payment_events_provider_ref_idx;
ALTER TABLE payment_events
  DROP CONSTRAINT payment_events_provider_ref_kind_key,
  ADD CONSTRAINT payment_events_organization_id_provider_ref_key UNIQUE (organization_id, provider_ref),
  DROP CONSTRAINT payment_events_provider_ref_check,
  ADD CONSTRAINT payment_events_provider_ref_check CHECK (provider_ref ~ '^sim_[a-z0-9_]{4,64}$');
ALTER TYPE payment_event_kind RENAME TO payment_event_kind_0019;
CREATE TYPE payment_event_kind AS ENUM ('succeeded', 'failed');
ALTER TABLE payment_events
  ALTER COLUMN kind TYPE payment_event_kind USING kind::text::payment_event_kind;
DROP TYPE payment_event_kind_0019;

ALTER TABLE invoices NO FORCE ROW LEVEL SECURITY;
ALTER TABLE invoices DISABLE TRIGGER invoices_status_only;
UPDATE invoices SET status = 'open' WHERE status = 'processing';
ALTER TABLE invoices ENABLE TRIGGER invoices_status_only;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE invoices ALTER COLUMN status DROP DEFAULT, DROP CONSTRAINT invoices_check2;
ALTER TYPE invoice_status RENAME TO invoice_status_0019;
CREATE TYPE invoice_status AS ENUM ('open', 'paid', 'failed');
ALTER TABLE invoices
  ALTER COLUMN status TYPE invoice_status USING status::text::invoice_status,
  ALTER COLUMN status SET DEFAULT 'open',
  ADD CONSTRAINT invoices_check2 CHECK ((status = 'paid') = (paid_at IS NOT NULL));
DROP TYPE invoice_status_0019;
