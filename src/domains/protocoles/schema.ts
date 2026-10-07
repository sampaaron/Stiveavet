import { sql } from "drizzle-orm";
import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Miroir typé de db/migrations/0004 (source de vérité) ; un test vérifie la concordance.

export const protocolCategory = pgEnum("protocol_category", [
  "surgery",
  "dental",
  "treatment",
  "other",
]);
export const protocolSpecies = pgEnum("protocol_species", [
  "dog",
  "cat",
  "both",
]);
export const protocolStepKind = pgEnum("protocol_step_kind", [
  "message",
  "question",
  "photo_request",
  "reminder",
  "control",
]);
export const alertLevel = pgEnum("alert_level", ["watch", "urgent"]);

export const protocols = pgTable("protocols", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  ownerMembershipId: uuid("owner_membership_id"),
  libraryKey: text("library_key"),
  duplicatedFromVersionId: uuid("duplicated_from_version_id"),
  currentVersionId: uuid("current_version_id"),
  createdByMembershipId: uuid("created_by_membership_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const protocolVersions = pgTable("protocol_versions", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  protocolId: uuid("protocol_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  name: text("name").notNull(),
  category: protocolCategory("category").notNull(),
  species: protocolSpecies("species").notNull(),
  description: text("description").notNull().default(""),
  durationDays: integer("duration_days").notNull(),
  changeNote: text("change_note").notNull().default(""),
  createdByMembershipId: uuid("created_by_membership_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  validatedByMembershipId: uuid("validated_by_membership_id"),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
});

export const protocolSteps = pgTable("protocol_steps", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  protocolVersionId: uuid("protocol_version_id").notNull(),
  position: integer("position").notNull(),
  offsetHours: integer("offset_hours").notNull(),
  kind: protocolStepKind("kind").notNull(),
  content: text("content").notNull(),
});

export const alertRules = pgTable("alert_rules", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  protocolVersionId: uuid("protocol_version_id").notNull(),
  position: integer("position").notNull(),
  level: alertLevel("level").notNull(),
  description: text("description").notNull(),
});
