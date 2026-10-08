import { sql } from "drizzle-orm";
import { z } from "zod";

import { outboxEvents, scheduledJobs } from "@/server/db/schema";
import type { JobPayload } from "@/server/db/schema";
import type { TenantTransaction } from "@/server/db/tenant";

import { IDEMPOTENCY_KEY_PATTERN, JOB_KIND_PATTERN } from "./kinds";

/**
 * Inscription des tâches et des événements, dans la transaction du changement métier
 * (le cabinet est celui de la transaction : RLS). Les charges utiles ne portent que des
 * identifiants et des codes, jamais de contenu clinique, de numéro ou d'e-mail.
 */

const payloadValue = z.union([
  z.uuid(),
  z.string().regex(/^[a-z0-9_.:-]{1,64}$/),
  z.number(),
  z.boolean(),
  z.null(),
]);
const payloadSchema = z.record(
  z.string().regex(/^[a-zA-Z]{1,40}$/),
  payloadValue,
);

const enqueueInput = z.object({
  organizationId: z.uuid(),
  kind: z.string().regex(JOB_KIND_PATTERN),
  idempotencyKey: z.string().regex(IDEMPOTENCY_KEY_PATTERN),
  runAt: z.date(),
  followupId: z.uuid().nullable().default(null),
  payload: payloadSchema.default({}),
  maxAttempts: z.int().min(1).max(20).default(5),
});
export type EnqueueInput = z.input<typeof enqueueInput>;

/**
 * Inscrit une tâche, une seule fois par clé d'idempotence : rejouer la même inscription
 * (double clic, outbox relue, webhook répété) ne crée jamais de doublon.
 * Renvoie l'identifiant de la tâche, qu'elle vienne d'être créée ou non.
 */
export async function enqueue(
  tx: TenantTransaction,
  input: EnqueueInput,
): Promise<{ id: string; created: boolean }> {
  const job = enqueueInput.parse(input);
  const [created] = await tx
    .insert(scheduledJobs)
    .values({
      organizationId: job.organizationId,
      kind: job.kind,
      idempotencyKey: job.idempotencyKey,
      runAt: job.runAt,
      followupId: job.followupId,
      payload: job.payload as JobPayload,
      maxAttempts: job.maxAttempts,
    })
    .onConflictDoNothing({
      target: [scheduledJobs.organizationId, scheduledJobs.idempotencyKey],
    })
    .returning({ id: scheduledJobs.id });
  if (created) return { id: created.id, created: true };
  const existing = await tx.execute<{ id: string }>(
    sql`SELECT id FROM scheduled_jobs WHERE organization_id = ${job.organizationId} AND idempotency_key = ${job.idempotencyKey}`,
  );
  const id = existing.rows[0]?.id;
  if (!id) throw new Error("Tâche introuvable après conflit");
  return { id, created: false };
}

const emitInput = z.object({
  organizationId: z.uuid(),
  topic: z.string().regex(JOB_KIND_PATTERN),
  aggregateType: z.string().regex(/^[a-z_]{2,40}$/),
  aggregateId: z.uuid(),
  payload: payloadSchema.default({}),
});
export type EmitInput = z.input<typeof emitInput>;

/** Événement métier, publié plus tard par le worker (outbox transactionnelle). */
export async function emit(tx: TenantTransaction, input: EmitInput) {
  const event = emitInput.parse(input);
  const [row] = await tx
    .insert(outboxEvents)
    .values({ ...event, payload: event.payload as JobPayload })
    .returning({ id: outboxEvents.id });
  if (!row) throw new Error("Événement non inscrit");
  return row.id;
}
