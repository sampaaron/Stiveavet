import { sql } from "drizzle-orm";
import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Miroir typé de db/migrations (source de vérité) ; un test d'intégration vérifie la concordance.

export const memberRole = pgEnum("member_role", [
  "admin_vet",
  "vet",
  "assistant",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const organizations = pgTable("organizations", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  ...timestamps,
});

export const users = pgTable("users", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  ...timestamps,
});

export const memberships = pgTable("memberships", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  userId: uuid("user_id").notNull(),
  role: memberRole("role").notNull(),
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  ...timestamps,
});
