import { sql } from "drizzle-orm";
import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Miroir typé de db/migrations/0002. Les tables du schéma `auth` n'ont pas de miroir :
// l'application n'y accède que par les fonctions de `repository.ts`.

export const loginEventKind = pgEnum("login_event_kind", [
  "login_succeeded",
  "login_failed",
  "login_rate_limited",
  "code_sent",
  "code_failed",
  "session_locked",
  "session_unlocked",
  "unlock_failed",
  "logout",
  "password_reset_requested",
  "password_reset_completed",
  "signup_completed",
]);

/** Journal de connexion : lecture seule pour l'application (ajout par les fonctions `auth`). */
export const loginEvents = pgTable("login_events", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id"),
  userId: uuid("user_id"),
  kind: loginEventKind("kind").notNull(),
  ipHash: text("ip_hash"),
  userAgent: text("user_agent"),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
