import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Miroir typé de db/migrations/0024 (source de vérité) ; un test vérifie la concordance.

const at = (name: string) => timestamp(name, { withTimezone: true });

/** Conversation d'une personne avec Stive ; visible d'elle seule (RLS). */
export const stiveConversations = pgTable("stive_conversations", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  membershipId: uuid("membership_id").notNull(),
  title: text("title").notNull(),
  followupId: uuid("followup_id"),
  createdAt: at("created_at").notNull().defaultNow(),
  updatedAt: at("updated_at").notNull().defaultNow(),
});

export const stiveMessages = pgTable("stive_messages", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  conversationId: uuid("conversation_id").notNull(),
  author: text("author", { enum: ["vet", "stive"] }).notNull(),
  body: text("body").notNull(),
  followupId: uuid("followup_id"),
  createdAt: at("created_at").notNull().defaultNow(),
});
