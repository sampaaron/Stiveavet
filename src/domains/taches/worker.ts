import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { outboxEvents } from "@/server/db/schema";
import type { JobPayload } from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import type { Database, TenantTransaction } from "@/server/db/tenant";

import { JOB_KIND_PATTERN, JobError } from "./kinds";
import type { JobErrorCode } from "./kinds";
import { enqueue } from "./queue";
import type { EnqueueInput } from "./queue";

/**
 * Worker de la file de tâches (architecture §9). Un passage :
 * 0. laisse les planificateurs inscrire les tâches périodiques du jour (balayage quotidien) ;
 * 1. publie les événements de l'outbox en tâches (idempotent) ;
 * 2. prend les tâches dues qu'il sait exécuter (`jobs.claim`, jamais deux fois la même) ;
 * 3. exécute chacune dans la transaction de son cabinet, puis la marque réussie dans cette
 *    même transaction ; en cas d'échec, programme la tentative suivante ou la met en échec.
 * Les journaux du worker ne contiennent que des identifiants, des types et des codes.
 */

export type ClaimedJob = {
  id: string;
  organizationId: string;
  kind: string;
  attempt: number;
  followupId: string | null;
  payload: JobPayload;
  /** Clé stable d'une tentative à l'autre : à transmettre aux prestataires (pas de doublon). */
  idempotencyKey: string;
};

export type JobHandler = (context: {
  tx: TenantTransaction;
  job: ClaimedJob;
}) => Promise<void>;

export type OutboxEvent = {
  id: string;
  organizationId: string;
  topic: string;
  aggregateType: string;
  aggregateId: string;
  payload: JobPayload;
  createdAt: Date;
};

/** Tâches à créer pour un événement ; la clé d'idempotence est dérivée de l'événement. */
export type OutboxRoute = (
  event: OutboxEvent,
) => Array<Omit<EnqueueInput, "organizationId" | "idempotencyKey">>;

/** Planification périodique (ex. balayage quotidien de conservation) : renvoie un nombre. */
export type JobPlanner = (db: Database) => Promise<number>;

export type WorkerOptions = {
  db: Database;
  workerId: string;
  handlers: Readonly<Record<string, JobHandler>>;
  routes?: Readonly<Record<string, OutboxRoute>>;
  planners?: readonly JobPlanner[];
  batchSize?: number;
  leaseSeconds?: number;
};

export type PassResult = {
  /** Tâches périodiques inscrites par les planificateurs. */
  planned: number;
  published: number;
  succeeded: number;
  retried: number;
  dead: number;
  /** Tâches reprises par un autre worker pendant l'exécution (bail expiré) : rien n'est écrit. */
  lost: number;
};

const claimedRow = z.object({
  job_id: z.uuid(),
  organization_id: z.uuid(),
  kind: z.string(),
  attempt: z.number().int(),
  followup_id: z.uuid().nullable(),
  payload: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
  idempotency_key: z.string(),
});

const workerIdSchema = z.string().regex(/^[a-z0-9-]{1,64}$/);

/** Le bail n'a pas survécu à l'exécution : la transaction est annulée. */
class LeaseLost extends Error {}

function errorCodeOf(error: unknown): JobErrorCode {
  return error instanceof JobError ? error.code : "unexpected_error";
}

export function createWorker(options: WorkerOptions) {
  const {
    db,
    handlers,
    routes = {},
    planners = [],
    batchSize = 20,
    leaseSeconds = 300,
  } = options;
  const workerId = workerIdSchema.parse(options.workerId);
  const kinds = Object.keys(handlers);
  for (const kind of kinds)
    if (!JOB_KIND_PATTERN.test(kind))
      throw new Error("Type de tâche invalide dans le worker");

  async function publishOutbox(): Promise<number> {
    const pending = await db.execute<{
      event_id: string;
      organization_id: string;
    }>(
      sql`SELECT event_id, organization_id FROM jobs.pending_outbox(${batchSize})`,
    );
    let published = 0;
    for (const {
      event_id: eventId,
      organization_id: organizationId,
    } of pending.rows) {
      const done = await withTenant(db, { organizationId }, async (tx) => {
        // Verrou : deux workers ne publient pas le même événement en même temps.
        const [event] = await tx
          .select()
          .from(outboxEvents)
          .where(
            and(eq(outboxEvents.id, eventId), isNull(outboxEvents.publishedAt)),
          )
          .for("update");
        if (!event) return false;
        const route = routes[event.topic];
        const jobs = route ? route(event) : [];
        for (const [index, job] of jobs.entries())
          await enqueue(tx, {
            ...job,
            organizationId,
            idempotencyKey: `outbox:${event.id}:${index}`,
          });
        await tx
          .update(outboxEvents)
          .set({ publishedAt: new Date() })
          .where(eq(outboxEvents.id, event.id));
        return true;
      });
      if (done) published += 1;
    }
    return published;
  }

  async function claim(): Promise<ClaimedJob[]> {
    if (!kinds.length) return [];
    const result = await db.execute(
      // Types validés par JOB_KIND_PATTERN : jamais de virgule, découpage sans ambiguïté.
      sql`SELECT * FROM jobs.claim(${workerId}, string_to_array(${kinds.join(",")}, ','), ${batchSize}, ${leaseSeconds})`,
    );
    return result.rows.map((raw) => {
      const row = claimedRow.parse(raw);
      return {
        id: row.job_id,
        organizationId: row.organization_id,
        kind: row.kind,
        attempt: row.attempt,
        followupId: row.followup_id,
        payload: row.payload,
        idempotencyKey: row.idempotency_key,
      };
    });
  }

  async function run(job: ClaimedJob): Promise<keyof PassResult> {
    const handler = handlers[job.kind];
    try {
      await withTenant(
        db,
        { organizationId: job.organizationId },
        async (tx) => {
          if (!handler) throw new JobError("unexpected_error");
          await handler({ tx, job });
          const done = await tx.execute<{ ok: boolean }>(
            sql`SELECT jobs.complete(${job.id}, ${workerId}, ${job.attempt}) AS ok`,
          );
          if (!done.rows[0]?.ok) throw new LeaseLost();
        },
      );
      return "succeeded";
    } catch (error) {
      if (error instanceof LeaseLost) return "lost";
      const code = errorCodeOf(error);
      const status = await withTenant(
        db,
        { organizationId: job.organizationId },
        async (tx) => {
          const result = await tx.execute<{ status: string | null }>(
            sql`SELECT jobs.fail(${job.id}, ${workerId}, ${job.attempt}, ${code}) AS status`,
          );
          return result.rows[0]?.status ?? null;
        },
      );
      if (status === "pending") return "retried";
      if (status === "dead") return "dead";
      return "lost";
    }
  }

  return {
    workerId,
    /** Un passage complet ; renvoie des compteurs seulement. */
    async runOnce(): Promise<PassResult> {
      let planned = 0;
      for (const planner of planners) planned += await planner(db);
      const result: PassResult = {
        planned,
        published: await publishOutbox(),
        succeeded: 0,
        retried: 0,
        dead: 0,
        lost: 0,
      };
      for (const job of await claim()) result[await run(job)] += 1;
      return result;
    },
  };
}

export type Worker = ReturnType<typeof createWorker>;
