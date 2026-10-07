import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { memberRole } from "@/domains/cabinet/schema";

// Miroir typé de db/migrations/0003.

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

export const permissions = pgTable("permissions", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  clinical: boolean("clinical").notNull().default(false),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    role: memberRole("role").notNull(),
    permission: text("permission").notNull(),
    isDefault: boolean("is_default").notNull(),
  },
  (table) => [primaryKey({ columns: [table.role, table.permission] })],
);

export const membershipPermissions = pgTable(
  "membership_permissions",
  {
    organizationId: uuid("organization_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    permission: text("permission").notNull(),
    grantedByMembershipId: uuid("granted_by_membership_id"),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.membershipId, table.permission] })],
);

export const invitations = pgTable("invitations", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  role: memberRole("role").notNull(),
  tokenHash: bytea("token_hash").notNull(),
  invitedByMembershipId: uuid("invited_by_membership_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
