import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { alertLevel, protocolStepKind } from "@/domains/protocoles/schema";

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
  protocolVersionId: uuid("protocol_version_id"),
  isTest: boolean("is_test").notNull().default(false),
  firstContactAt: timestamp("first_contact_at", { withTimezone: true }),
  planRevision: integer("plan_revision").notNull().default(0),
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
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.followupId, table.membershipId] })],
);

// Migration 0008 : contacts, historique des statuts et consentements.

export const followupContactRole = pgEnum("followup_contact_role", [
  "primary",
  "secondary",
]);
export const consentState = pgEnum("consent_state", [
  "requested",
  "given",
  "withdrawn",
]);

export const followupContacts = pgTable("followup_contacts", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  followupId: uuid("followup_id").notNull(),
  ownerId: uuid("owner_id").notNull(),
  ownerContactId: uuid("owner_contact_id").notNull(),
  role: followupContactRole("role").notNull(),
  active: boolean("active").notNull().default(true),
  language: language("language").notNull().default("fr"),
  leftGroupAt: timestamp("left_group_at", { withTimezone: true }),
  createdAt,
  updatedAt,
});

/** Écrit par la base à chaque changement de statut (ajout seul). */
export const followupStatusEvents = pgTable("followup_status_events", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  followupId: uuid("followup_id").notNull(),
  fromStatus: followupStatus("from_status"),
  toStatus: followupStatus("to_status").notNull(),
  actorMembershipId: uuid("actor_membership_id"),
  reason: text("reason"),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Ajout seul : l'état courant d'un contact est sa ligne la plus récente. */
export const consents = pgTable("consents", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  followupId: uuid("followup_id").notNull(),
  followupContactId: uuid("followup_contact_id").notNull(),
  state: consentState("state").notNull(),
  wordingVersion: text("wording_version").notNull(),
  groupExplained: boolean("group_explained").notNull().default(false),
  messageId: uuid("message_id"),
  recordedAt: timestamp("recorded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Migration 0010 : fiche de lancement (import dr.veto, traitements, étapes, signes d'alerte).

export const treatmentSource = pgEnum("treatment_source", ["drveto", "vet"]);

/** Résumé importé de dr.veto, figé au moment de la préparation. */
export const followupImports = pgTable("followup_imports", {
  followupId: uuid("followup_id").primaryKey(),
  organizationId: uuid("organization_id").notNull(),
  source: text("source").notNull(),
  externalRef: text("external_ref").notNull(),
  allergies: text("allergies")
    .array()
    .notNull()
    .default(sql`'{}'`),
  antecedents: text("antecedents")
    .array()
    .notNull()
    .default(sql`'{}'`),
  importedByMembershipId: uuid("imported_by_membership_id").notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const followupTreatments = pgTable("followup_treatments", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  followupId: uuid("followup_id").notNull(),
  source: treatmentSource("source").notNull(),
  name: text("name").notNull(),
  instructions: text("instructions").notNull(),
  validatedByMembershipId: uuid("validated_by_membership_id"),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  removedAt: timestamp("removed_at", { withTimezone: true }),
  createdAt,
});

export const followupSteps = pgTable("followup_steps", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  followupId: uuid("followup_id").notNull(),
  revision: integer("revision").notNull(),
  position: integer("position").notNull(),
  offsetHours: integer("offset_hours").notNull(),
  kind: protocolStepKind("kind").notNull(),
  content: text("content").notNull(),
  supersededAt: timestamp("superseded_at", { withTimezone: true }),
  createdAt,
});

export const followupAlertRules = pgTable("followup_alert_rules", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  followupId: uuid("followup_id").notNull(),
  revision: integer("revision").notNull(),
  position: integer("position").notNull(),
  level: alertLevel("level").notNull(),
  description: text("description").notNull(),
  supersededAt: timestamp("superseded_at", { withTimezone: true }),
  createdAt,
});

// Migration 0013 : synthèse pré-consultation, refaite quand les échanges changent.

export const followupSyntheses = pgTable("followup_syntheses", {
  followupId: uuid("followup_id").primaryKey(),
  organizationId: uuid("organization_id").notNull(),
  content: jsonb("content").notNull(),
  sourceDigest: text("source_digest").notNull(),
  engine: text("engine").notNull().default("simulated"),
  generatedAt: timestamp("generated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
