import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Miroir typé de db/migrations/0005 (source de vérité) ; un test vérifie la concordance.

export const emergencyPeriod = pgEnum("emergency_period", [
  "day",
  "night",
  "weekend",
  "holiday",
]);
export const availabilityKind = pgEnum("availability_kind", [
  "messages",
  "appointments",
]);
export const integrationProvider = pgEnum("integration_provider", [
  "whatsapp",
  "drveto",
  "payment_mandate",
]);
export const onboardingStep = pgEnum("onboarding_step", [
  "organization",
  "whatsapp",
  "drveto",
  "rules",
  "team",
  "protocols",
  "billing",
  "test_followup",
]);

const at = (name: string) =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();

export const organizationSettings = pgTable("organization_settings", {
  organizationId: uuid("organization_id").primaryKey(),
  timezone: text("timezone").notNull().default("Europe/Paris"),
  escalationDelayMinutes: integer("escalation_delay_minutes")
    .notNull()
    .default(240),
  photoAnalysisEnabled: boolean("photo_analysis_enabled")
    .notNull()
    .default(false),
  updatedByMembershipId: uuid("updated_by_membership_id"),
  updatedAt: at("updated_at"),
});

export const availabilityWindows = pgTable("availability_windows", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  kind: availabilityKind("kind").notNull(),
  weekday: smallint("weekday").notNull(),
  startsAt: time("starts_at").notNull(),
  endsAt: time("ends_at").notNull(),
});

export const emergencyInstructions = pgTable(
  "emergency_instructions",
  {
    organizationId: uuid("organization_id").notNull(),
    period: emergencyPeriod("period").notNull(),
    instructions: text("instructions").notNull(),
    updatedByMembershipId: uuid("updated_by_membership_id").notNull(),
    updatedAt: at("updated_at"),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.period] })],
);

export const emergencyContacts = pgTable("emergency_contacts", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  label: text("label").notNull(),
  phone: text("phone").notNull(),
  position: integer("position").notNull(),
  createdAt: at("created_at"),
});

export const onCallSchedules = pgTable("on_call_schedules", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  membershipId: uuid("membership_id").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  createdByMembershipId: uuid("created_by_membership_id").notNull(),
  createdAt: at("created_at"),
});

export const integrationConnections = pgTable(
  "integration_connections",
  {
    organizationId: uuid("organization_id").notNull(),
    provider: integrationProvider("provider").notNull(),
    mode: text("mode").notNull().default("simulated"),
    displayLabel: text("display_label").notNull(),
    connectedByMembershipId: uuid("connected_by_membership_id").notNull(),
    connectedAt: at("connected_at"),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.provider] })],
);

export const onboardingSteps = pgTable(
  "onboarding_steps",
  {
    organizationId: uuid("organization_id").notNull(),
    step: onboardingStep("step").notNull(),
    completedByMembershipId: uuid("completed_by_membership_id").notNull(),
    completedAt: at("completed_at"),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.step] })],
);
