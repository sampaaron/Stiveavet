import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Miroir typé de db/migrations (source de vérité) ; un test d'intégration vérifie la concordance.

/** Métadonnées techniques uniquement : identifiants, rôles, compteurs. Jamais de contenu clinique. */
export type AuditMetadata = Record<
  string,
  string | number | boolean | null | readonly string[]
>;

export const auditEvents = pgTable("audit_events", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  actorMembershipId: uuid("actor_membership_id"),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: uuid("target_id"),
  metadata: jsonb("metadata").$type<AuditMetadata>().notNull().default({}),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
