import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Miroir typé de db/migrations/0006 (source de vérité) ; un test vérifie la concordance.

export const subscriptionPlan = pgEnum("subscription_plan", [
  "solo",
  "solo_pro",
  "clinic",
  "clinic_pro",
]);
export const billingCycle = pgEnum("billing_cycle", ["monthly", "annual"]);
export const usageKind = pgEnum("usage_kind", ["launch", "reactivation"]);
export const invoiceStatus = pgEnum("invoice_status", [
  "open",
  "paid",
  "failed",
]);
export const paymentEventKind = pgEnum("payment_event_kind", [
  "succeeded",
  "failed",
]);

const at = (name: string) =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();
const maybeAt = (name: string) => timestamp(name, { withTimezone: true });

export const subscriptions = pgTable("subscriptions", {
  organizationId: uuid("organization_id").primaryKey(),
  plan: subscriptionPlan("plan").notNull(),
  cycle: billingCycle("cycle").notNull().default("monthly"),
  startedAt: at("started_at"),
  cycleChosenAt: maybeAt("cycle_chosen_at"),
  annualEndsAt: maybeAt("annual_ends_at"),
  unpaidSince: maybeAt("unpaid_since"),
  canceledAt: maybeAt("canceled_at"),
  endsAt: maybeAt("ends_at"),
  updatedAt: at("updated_at"),
});

export type InvoiceLineRow = { label: string; amountCents: number };

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull(),
  number: text("number").notNull(),
  subscriptionMonth: integer("subscription_month").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  lines: jsonb("lines").$type<InvoiceLineRow[]>().notNull(),
  subtotalCents: integer("subtotal_cents").notNull(),
  vatCents: integer("vat_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  status: invoiceStatus("status").notNull().default("open"),
  issuedAt: at("issued_at"),
  paidAt: maybeAt("paid_at"),
});

export const usageEvents = pgTable("usage_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull(),
  followupId: uuid("followup_id").notNull(),
  kind: usageKind("kind").notNull(),
  activeBefore: integer("active_before").notNull(),
  amountCents: integer("amount_cents").notNull(),
  occurredAt: at("occurred_at"),
  idempotencyKey: text("idempotency_key").notNull(),
  invoiceId: uuid("invoice_id"),
});

export const paymentEvents = pgTable("payment_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull(),
  invoiceId: uuid("invoice_id").notNull(),
  kind: paymentEventKind("kind").notNull(),
  providerRef: text("provider_ref").notNull(),
  amountCents: integer("amount_cents").notNull(),
  occurredAt: at("occurred_at"),
});
