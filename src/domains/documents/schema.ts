import { sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Miroir typé de db/migrations/0029 (source de vérité) ; un test vérifie la concordance.

const at = (name: string) => timestamp(name, { withTimezone: true });

export const DOCUMENT_CATEGORIES = [
  "owner_sheet",
  "procedure",
  "admin",
  "other",
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export type DocumentContentType =
  "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

/** Documents du cabinet (ADR 0045) : la base ne garde que la clé du fichier. */
export const cabinetDocuments = pgTable("cabinet_documents", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  title: text("title").notNull(),
  category: text("category").$type<DocumentCategory>().notNull(),
  storageKey: text("storage_key").notNull(),
  contentType: text("content_type").$type<DocumentContentType>().notNull(),
  byteSize: integer("byte_size").notNull(),
  sha256: text("sha256").notNull(),
  addedByMembershipId: uuid("added_by_membership_id"),
  createdAt: at("created_at").notNull().defaultNow(),
  deletedAt: at("deleted_at"),
});
