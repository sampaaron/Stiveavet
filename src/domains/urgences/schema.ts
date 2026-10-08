import { sql } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { alertLevel } from "@/domains/protocoles/schema";
import { triageLevel } from "@/domains/suivis/schema";

// Miroir typé de db/migrations/0008 (source de vérité) ; un test vérifie la concordance.

export const triageSource = pgEnum("triage_source", ["rule", "ai", "vet"]);
export const alertStatus = pgEnum("alert_status", [
  "open",
  "acknowledged",
  "escalated",
  "resolved",
]);

const at = (name: string) => timestamp(name, { withTimezone: true });

/** Ajout seul ; `reason` est réservé aux personnes autorisées aux données cliniques. */
export const triageEvents = pgTable("triage_events", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  followupId: uuid("followup_id").notNull(),
  messageId: uuid("message_id"),
  level: triageLevel("level").notNull(),
  source: triageSource("source").notNull(),
  alertRuleId: uuid("alert_rule_id"),
  reason: text("reason").notNull(),
  createdByMembershipId: uuid("created_by_membership_id"),
  createdAt: at("created_at").notNull().defaultNow(),
});

export const alerts = pgTable("alerts", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  followupId: uuid("followup_id").notNull(),
  triageEventId: uuid("triage_event_id").notNull(),
  level: alertLevel("level").notNull(),
  status: alertStatus("status").notNull().default("open"),
  targetMembershipId: uuid("target_membership_id").notNull(),
  escalateAt: at("escalate_at"),
  escalatedAt: at("escalated_at"),
  resolvedAt: at("resolved_at"),
  resolvedByMembershipId: uuid("resolved_by_membership_id"),
  createdAt: at("created_at").notNull().defaultNow(),
});

export const acknowledgements = pgTable(
  "acknowledgements",
  {
    organizationId: uuid("organization_id").notNull(),
    alertId: uuid("alert_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    acknowledgedAt: at("acknowledged_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.alertId, table.membershipId] })],
);
