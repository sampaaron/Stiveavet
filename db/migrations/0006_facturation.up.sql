-- 0006 : facturation (cahier des charges §13, architecture §6).
--
-- Abonnement par cabinet, usage (lancements et réactivations au-delà de 10 suivis actifs),
-- factures mensuelles et événements de paiement. Le prestataire de paiement est simulé
-- (ADR 0004) : aucune donnée bancaire n'est conservée, seulement des références simulées.
-- Tout l'état (essai, impayé, blocage, lecture seule) se déduit de ces faits (ADR 0011).

CREATE TYPE subscription_plan AS ENUM ('solo', 'solo_pro', 'clinic', 'clinic_pro');
CREATE TYPE billing_cycle AS ENUM ('monthly', 'annual');
CREATE TYPE usage_kind AS ENUM ('launch', 'reactivation');
CREATE TYPE invoice_status AS ENUM ('open', 'paid', 'failed');
CREATE TYPE payment_event_kind AS ENUM ('succeeded', 'failed');

CREATE TABLE subscriptions (
  organization_id uuid PRIMARY KEY REFERENCES organizations (id),
  -- Formule choisie à l'inscription, appliquée après les 2 mois d'essai.
  plan subscription_plan NOT NULL,
  cycle billing_cycle NOT NULL DEFAULT 'monthly',
  started_at timestamptz NOT NULL DEFAULT now(),
  -- Choix explicite du cycle ; sans choix, la formule reste mensuelle (aucune bascule automatique).
  cycle_chosen_at timestamptz,
  annual_ends_at timestamptz,
  -- Premier prélèvement échoué non régularisé.
  unpaid_since timestamptz,
  canceled_at timestamptz,
  ends_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cycle = 'monthly' OR (cycle_chosen_at IS NOT NULL AND annual_ends_at IS NOT NULL)),
  CHECK ((canceled_at IS NULL) = (ends_at IS NULL)),
  CHECK (ends_at IS NULL OR ends_at >= canceled_at)
);

-- L'engagement annuel ne se prend qu'à partir du mois 3 (essai sans engagement).
CREATE FUNCTION app.check_subscription_change() RETURNS trigger
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
CREATE TRIGGER subscriptions_change BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION app.check_subscription_change();
CREATE TRIGGER subscriptions_touch BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  number text NOT NULL CHECK (number ~ '^SV-[0-9]{4}-[0-9]{3,}$'),
  subscription_month integer NOT NULL CHECK (subscription_month >= 1),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  lines jsonb NOT NULL CHECK (jsonb_typeof(lines) = 'array'),
  subtotal_cents integer NOT NULL CHECK (subtotal_cents >= 0),
  vat_cents integer NOT NULL CHECK (vat_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents = subtotal_cents + vat_cents),
  status invoice_status NOT NULL DEFAULT 'open',
  issued_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  CHECK (period_end > period_start),
  CHECK ((status = 'paid') = (paid_at IS NOT NULL)),
  -- Une seule facture par mois d'abonnement : une même échéance ne peut pas être facturée deux fois.
  UNIQUE (organization_id, subscription_month),
  UNIQUE (organization_id, number),
  UNIQUE (organization_id, id)
);

-- Une facture émise ne change plus, sauf son statut de paiement.
CREATE FUNCTION app.invoice_status_only() RETURNS trigger
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
CREATE TRIGGER invoices_status_only BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION app.invoice_status_only();

-- Lancement ou réactivation d'un suivi : supplément éventuel, prélevé avec l'abonnement suivant.
CREATE TABLE usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  followup_id uuid NOT NULL,
  kind usage_kind NOT NULL,
  active_before integer NOT NULL CHECK (active_before >= 0),
  amount_cents integer NOT NULL CHECK (
    (kind = 'launch' AND amount_cents IN (0, 250)) OR (kind = 'reactivation' AND amount_cents IN (0, 126))
  ),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  -- Clé d'idempotence : un même lancement n'est jamais compté deux fois.
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 120),
  invoice_id uuid,
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, followup_id) REFERENCES followups (organization_id, id),
  FOREIGN KEY (organization_id, invoice_id) REFERENCES invoices (organization_id, id)
);
CREATE INDEX usage_events_unbilled_idx ON usage_events (organization_id, occurred_at) WHERE invoice_id IS NULL;

-- Un événement d'usage ne change plus, sauf son rattachement (une seule fois) à une facture.
CREATE FUNCTION app.usage_event_invoice_once() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF OLD.invoice_id IS NOT NULL OR NEW.invoice_id IS NULL THEN
      RAISE EXCEPTION 'un usage n''est facturé qu''une fois' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END $$;
CREATE TRIGGER usage_events_invoice_once BEFORE UPDATE ON usage_events
  FOR EACH ROW EXECUTE FUNCTION app.usage_event_invoice_once();

-- Journal des paiements, en ajout seul.
CREATE TABLE payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  invoice_id uuid NOT NULL,
  kind payment_event_kind NOT NULL,
  provider_ref text NOT NULL CHECK (provider_ref ~ '^sim_[a-z0-9_]{4,64}$'),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider_ref),
  FOREIGN KEY (organization_id, invoice_id) REFERENCES invoices (organization_id, id)
);

DO $$
DECLARE
  tenant_table text;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY['subscriptions', 'invoices', 'usage_events', 'payment_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = app.current_organization_id()) WITH CHECK (organization_id = app.current_organization_id())',
      tenant_table
    );
  END LOOP;
END $$;

-- Aucune suppression ; mises à jour limitées aux colonnes d'état.
GRANT SELECT, INSERT ON subscriptions, invoices, usage_events, payment_events TO stivea_app;
GRANT UPDATE (plan, cycle, cycle_chosen_at, annual_ends_at, unpaid_since, canceled_at, ends_at)
  ON subscriptions TO stivea_app;
GRANT UPDATE (status, paid_at) ON invoices TO stivea_app;
GRANT UPDATE (invoice_id) ON usage_events TO stivea_app;

REVOKE ALL ON FUNCTION app.check_subscription_change(), app.invoice_status_only(),
  app.usage_event_invoice_once() FROM PUBLIC;
