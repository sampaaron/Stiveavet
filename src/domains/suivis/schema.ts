import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Miroir typé de db/migrations (source de vérité) ; un test d'intégration vérifie la concordance.

export const species = pgEnum("species", ["dog", "cat"]);
export const language = pgEnum("language", ["fr", "en"]);
export const contactKind = pgEnum("contact_kind", ["whatsapp", "email"]);
export const followupStatus = pgEnum("followup_status", [
  "draft",
  "active",
  "paused",
  "human_takeover",
  "ended",
]);
export const triageLevel = pgEnum("triage_level", [
  "normal",
  "watch",
  "urgent",
]);

const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow();

export const animals = pgTable("animals", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  name: text("name").notNull(),
  species: species("species").notNull(),
  breed: text("breed"),
  birthDate: date("birth_date"),
  weightGrams: integer("weight_grams"),
  externalRef: text("external_ref"),
  createdAt,
  updatedAt,
});

export const owners = pgTable("owners", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  fullName: text("full_name").notNull(),
  preferredLanguage: language("preferred_language").notNull().default("fr"),
  createdAt,
  updatedAt,
});

export const ownerContacts = pgTable("owner_contacts", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  ownerId: uuid("owner_id").notNull(),
  kind: contactKind("kind").notNull(),
  value: text("value").notNull(),
  createdAt,
});

export const animalOwners = pgTable(
  "animal_owners",
  {
    organizationId: uuid("organization_id").notNull(),
    animalId: uuid("animal_id").notNull(),
    ownerId: uuid("owner_id").notNull(),
    createdAt,
  },
  (table) => [primaryKey({ columns: [table.animalId, table.ownerId] })],
);

export const followups = pgTable("followups", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  animalId: uuid("animal_id").notNull(),
  responsibleMembershipId: uuid("responsible_membership_id").notNull(),
  procedure: text("procedure").notNull(),
  procedureAt: timestamp("procedure_at", { withTimezone: true }).notNull(),
  status: followupStatus("status").notNull().default("draft"),
  triage: triageLevel("triage").notNull().default("normal"),
  isPrivate: boolean("is_private").notNull().default(false),
  controlAppointmentAt: timestamp("control_appointment_at", {
    withTimezone: true,
  }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt,
  updatedAt,
});

export const followupShares = pgTable(
  "followup_shares",
  {
    organizationId: uuid("organization_id").notNull(),
    followupId: uuid("followup_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    grantedByMembershipId: uuid("granted_by_membership_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt,
  },
  (table) => [primaryKey({ columns: [table.followupId, table.membershipId] })],
);
