-- Annule 0006. Supprime abonnements, usage, factures et paiements : local, CI ou retour arrière validé.

DROP TABLE payment_events, usage_events, invoices, subscriptions;
DROP FUNCTION app.check_subscription_change(), app.invoice_status_only(), app.usage_event_invoice_once();
DROP TYPE payment_event_kind, invoice_status, usage_kind, billing_cycle, subscription_plan;
