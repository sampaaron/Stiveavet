import { sql } from "drizzle-orm";
import {
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Miroir typé de db/migrations/0024 (source de vérité) ; un test vérifie la concordance.

const at = (name: string) => timestamp(name, { withTimezone: true });

/** Échanges avec Stive, visibles par leur seul auteur, effacés à 30 jours. */
export const stiveMessages = pgTable("stive_messages", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  membershipId: uuid("membership_id").notNull(),
  author: text("author").$type<"member" | "stive">().notNull(),
  question: text("question"),
  answer: jsonb("answer"),
  createdAt: at("created_at").notNull().defaultNow(),
});

/** Propositions « À confirmer » et brouillons préparés par Stive. */
export const stiveProposals = pgTable("stive_proposals", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  membershipId: uuid("membership_id").notNull(),
  messageId: uuid("message_id").notNull(),
  kind: text("kind")
    .$type<"appointment" | "followup_status" | "message_draft">()
    .notNull(),
  followupId: uuid("followup_id").notNull(),
  appointmentId: uuid("appointment_id"),
  change: text("change").$type<"pause" | "resume" | "stop">(),
  draft: text("draft"),
  status: text("status")
    .$type<"open" | "done" | "expired">()
    .notNull()
    .default("open"),
  outcome: text("outcome").$type<
    "confirmed" | "declined" | "paused" | "resumed" | "stopped"
  >(),
  createdAt: at("created_at").notNull().defaultNow(),
  decidedAt: at("decided_at"),
});

/** Demandes faites à Stive, par personne et par mois de Paris. */
export const stiveUsage = pgTable(
  "stive_usage",
  {
    organizationId: uuid("organization_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    month: date("month").notNull(),
    requests: integer("requests").notNull(),
  },
  (table) => [primaryKey({ columns: [table.membershipId, table.month] })],
);
