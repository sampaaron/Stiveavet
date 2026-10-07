import { sql } from "drizzle-orm";
import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Miroir typé de db/migrations/0008 (source de vérité) ; un test vérifie la concordance.

export const deliveryChannel = pgEnum("delivery_channel", [
  "whatsapp",
  "desktop",
  "email",
]);
export const deliveryStatus = pgEnum("delivery_status", [
  "pending",
  "sent",
  "delivered",
  "failed",
]);

const at = (name: string) => timestamp(name, { withTimezone: true });

export const notificationDeliveries = pgTable("notification_deliveries", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  channel: deliveryChannel("channel").notNull(),
  recipientMembershipId: uuid("recipient_membership_id").notNull(),
  alertId: uuid("alert_id"),
  jobId: uuid("job_id"),
  idempotencyKey: text("idempotency_key").notNull(),
  status: deliveryStatus("status").notNull().default("pending"),
  externalRef: text("external_ref"),
  errorCode: text("error_code"),
  createdAt: at("created_at").notNull().defaultNow(),
  sentAt: at("sent_at"),
  failedAt: at("failed_at"),
});
