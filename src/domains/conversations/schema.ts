import { sql } from "drizzle-orm";
import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { language } from "@/domains/suivis/schema";

// Miroir typé de db/migrations/0008 (source de vérité) ; un test vérifie la concordance.

export const threadKind = pgEnum("thread_kind", ["direct", "group"]);
export const messageDirection = pgEnum("message_direction", [
  "inbound",
  "outbound",
  "internal",
]);
export const messageAuthor = pgEnum("message_author", [
  "owner",
  "numa",
  "vet",
  "system",
]);
export const messageDelivery = pgEnum("message_delivery", [
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
]);
export const attachmentKind = pgEnum("attachment_kind", [
  "photo",
  "voice",
  "document",
  "agenda_capture",
]);

const at = (name: string) => timestamp(name, { withTimezone: true });

export const conversationThreads = pgTable("conversation_threads", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  followupId: uuid("followup_id").notNull(),
  kind: threadKind("kind").notNull(),
  followupContactId: uuid("followup_contact_id"),
  externalRef: text("external_ref"),
  openedAt: at("opened_at").notNull().defaultNow(),
  closedAt: at("closed_at"),
});

/** `body` est un contenu clinique : jamais journalisé, jamais lu sans `clinical.read`. */
export const messages = pgTable("messages", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  followupId: uuid("followup_id").notNull(),
  threadId: uuid("thread_id").notNull(),
  direction: messageDirection("direction").notNull(),
  author: messageAuthor("author").notNull(),
  followupContactId: uuid("followup_contact_id"),
  authorMembershipId: uuid("author_membership_id"),
  body: text("body").notNull().default(""),
  language: language("language"),
  deliveryStatus: messageDelivery("delivery_status"),
  idempotencyKey: text("idempotency_key"),
  externalRef: text("external_ref"),
  occurredAt: at("occurred_at").notNull().defaultNow(),
  sentAt: at("sent_at"),
  deliveredAt: at("delivered_at"),
  readAt: at("read_at"),
  failedAt: at("failed_at"),
  errorCode: text("error_code"),
});

export const attachments = pgTable("attachments", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  followupId: uuid("followup_id"),
  messageId: uuid("message_id"),
  kind: attachmentKind("kind").notNull(),
  storageKey: text("storage_key").notNull(),
  contentType: text("content_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  sha256: text("sha256").notNull(),
  retentionUntil: at("retention_until").notNull(),
  deletedAt: at("deleted_at"),
  createdAt: at("created_at").notNull().defaultNow(),
});

export const voiceTranscripts = pgTable("voice_transcripts", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  followupId: uuid("followup_id").notNull(),
  attachmentId: uuid("attachment_id").notNull(),
  text: text("text").notNull(),
  language: language("language"),
  engine: text("engine").notNull().default("simulated"),
  createdAt: at("created_at").notNull().defaultNow(),
});
