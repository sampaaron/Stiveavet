import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Miroir typé de db/migrations/0017 (source de vérité) ; un test vérifie la concordance.

const at = (name: string) => timestamp(name, { withTimezone: true });

/** Numéro WhatsApp Business du cabinet ; le jeton n'est jamais lu en clair hors du worker. */
export const whatsappAccounts = pgTable("whatsapp_accounts", {
  organizationId: uuid("organization_id").primaryKey(),
  wabaId: text("waba_id").notNull(),
  phoneNumberId: text("phone_number_id").notNull(),
  accessTokenSealed: text("access_token_sealed").notNull(),
  connectedByMembershipId: uuid("connected_by_membership_id").notNull(),
  connectedAt: at("connected_at").notNull().defaultNow(),
});

/** Événements des prestataires déjà traités : clé et type, jamais de contenu. */
export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  provider: text("provider").$type<"whatsapp" | "stripe">().notNull(),
  eventKey: text("event_key").notNull(),
  kind: text("kind").notNull(),
  receivedAt: at("received_at").notNull().defaultNow(),
});
