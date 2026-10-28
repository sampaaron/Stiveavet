import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Miroir typé de db/migrations/0031 (source de vérité) ; un test vérifie la concordance.

const at = (name: string) => timestamp(name, { withTimezone: true });

/** Modèles de réponse du cabinet (ADR 0048) : des textes d'équipe, aucune donnée d'animal. */
export const replyTemplates = pgTable("reply_templates", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  language: text("language").$type<"fr" | "en">().notNull(),
  createdByMembershipId: uuid("created_by_membership_id"),
  createdAt: at("created_at").notNull().defaultNow(),
  updatedAt: at("updated_at").notNull().defaultNow(),
});
