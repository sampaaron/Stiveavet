import { sql } from "drizzle-orm";
import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Miroir typé de db/migrations/0008 (source de vérité) ; un test vérifie la concordance.

export const appointmentKind = pgEnum("appointment_kind", [
  "post_op_control",
  "emergency",
  "treatment_followup",
  "other",
]);
export const appointmentStatus = pgEnum("appointment_status", [
  "proposed",
  "confirmed",
  "cancelled",
]);
export const appointmentSource = pgEnum("appointment_source", [
  "numa",
  "staff",
  "drveto",
]);

const at = (name: string) => timestamp(name, { withTimezone: true });

export const appointments = pgTable("appointments", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  followupId: uuid("followup_id"),
  animalId: uuid("animal_id").notNull(),
  membershipId: uuid("membership_id").notNull(),
  kind: appointmentKind("kind").notNull(),
  status: appointmentStatus("status").notNull().default("proposed"),
  source: appointmentSource("source").notNull(),
  startsAt: at("starts_at").notNull(),
  endsAt: at("ends_at").notNull(),
  confirmedByMembershipId: uuid("confirmed_by_membership_id"),
  confirmedAt: at("confirmed_at"),
  cancelledAt: at("cancelled_at"),
  externalRef: text("external_ref"),
  createdAt: at("created_at").notNull().defaultNow(),
  updatedAt: at("updated_at").notNull().defaultNow(),
});

/** Migration 0012 : créneaux libres lus sur une capture d'agenda. */
export const agendaFreeSlots = pgTable("agenda_free_slots", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  membershipId: uuid("membership_id").notNull(),
  startsAt: at("starts_at").notNull(),
  endsAt: at("ends_at").notNull(),
  source: text("source").notNull().default("capture"),
  createdByMembershipId: uuid("created_by_membership_id").notNull(),
  createdAt: at("created_at").notNull().defaultNow(),
});
