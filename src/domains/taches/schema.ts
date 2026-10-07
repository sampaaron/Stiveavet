import { sql } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Miroir typé de db/migrations/0008 (source de vérité) ; un test vérifie la concordance.

/** Identifiants et codes seulement : jamais de contenu clinique, numéro ou e-mail. */
export type JobPayload = Record<string, string | number | boolean | null>;

export const jobStatus = pgEnum("job_status", [
  "pending",
  "running",
  "succeeded",
  "dead",
  "cancelled",
]);
export const jobOutcome = pgEnum("job_outcome", ["succeeded", "failed"]);

const at = (name: string) => timestamp(name, { withTimezone: true });

export const outboxEvents = pgTable("outbox_events", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  topic: text("topic").notNull(),
  aggregateType: text("aggregate_type").notNull(),
  aggregateId: uuid("aggregate_id").notNull(),
  payload: jsonb("payload").$type<JobPayload>().notNull().default({}),
  createdAt: at("created_at").notNull().defaultNow(),
  publishedAt: at("published_at"),
});

export const scheduledJobs = pgTable("scheduled_jobs", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  kind: text("kind").notNull(),
  followupId: uuid("followup_id"),
  payload: jsonb("payload").$type<JobPayload>().notNull().default({}),
  idempotencyKey: text("idempotency_key").notNull(),
  status: jobStatus("status").notNull().default("pending"),
  runAt: at("run_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  lockedBy: text("locked_by"),
  lockedUntil: at("locked_until"),
  lastErrorCode: text("last_error_code"),
  createdAt: at("created_at").notNull().defaultNow(),
  updatedAt: at("updated_at").notNull().defaultNow(),
  finishedAt: at("finished_at"),
});

export const jobAttempts = pgTable(
  "job_attempts",
  {
    organizationId: uuid("organization_id").notNull(),
    jobId: uuid("job_id").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    startedAt: at("started_at").notNull().defaultNow(),
    finishedAt: at("finished_at"),
    outcome: jobOutcome("outcome"),
    errorCode: text("error_code"),
  },
  (table) => [primaryKey({ columns: [table.jobId, table.attemptNumber] })],
);
