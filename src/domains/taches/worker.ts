import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { outboxEvents, scheduledJobs } from "@/server/db/schema";
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
 * 2. prend quelques tâches dues qu'il sait exécuter (`jobs.claim`, jamais deux fois la même) ;
 * 3. les exécute en parallèle d'un suivi à l'autre, dans l'ordre pour un même suivi : chacune
 *    dans la transaction de son cabinet, marquée réussie dans cette même transaction ; en cas
 *    d'échec, programme la tentative suivante ou la met en échec (tout de suite pour un échec
 *    définitif), et prévient l'exécutant d'échec du type. Un exécutant en deux temps appelle
 *    son prestataire (IA, Meta) hors transaction, après avoir prolongé son bail (ADR 0040) ;
 * 4. reprend les tâches devenues dues entre-temps (un envoi inscrit par un message), en
 *    quelques tours au plus.
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

/** Courte transaction de lecture dans le cabinet de la tâche ; prolonge d'abord son bail. */
export type JobReader = <T>(
  run: (tx: TenantTransaction) => Promise<T>,
) => Promise<T>;

/**
 * Exécutant en deux temps, pour une tâche qui appelle un prestataire lent (IA, Meta) :
 * - `prepare` lit ce qu'il lui faut (`read`, sans verrou), puis appelle le prestataire hors
 *   de toute transaction : aucune connexion ni aucun verrou n'est gardé pendant l'appel ;
 * - `commit` reprend les verrous, revérifie l'état et écrit, sans appel extérieur. Il doit
 *   être idempotent : son écriture est gardée même si le bail a été perdu pendant l'appel,
 *   pour que la reprise de la tâche ailleurs ne refasse pas ce qui est déjà parti.
 * Une erreur levée par l'une ou l'autre étape suit le chemin d'échec habituel.
 */
export type StagedJobHandler<Prepared> = {
  prepare(context: { job: ClaimedJob; read: JobReader }): Promise<Prepared>;
  commit(context: {
    tx: TenantTransaction;
    job: ClaimedJob;
    prepared: Prepared;
  }): Promise<void>;
};

export type AnyJobHandler = JobHandler | StagedJobHandler<unknown>;

export type OutboxEvent = {
  id: string;
  organizationId: string;
  topic: string;
  aggregateType: string;
  aggregateId: string;
  payload: JobPayload;
  createdAt: Date;
};

/**
 * Appelé dans la transaction du cabinet quand une tâche passe en échec (après la dernière
 * tentative ou un échec définitif) : par exemple, prévenir le vétérinaire (§15).
 */
export type DeadJobHandler = (context: {
  tx: TenantTransaction;
  job: ClaimedJob;
  code: JobErrorCode;
}) => Promise<void>;

/** Tâches à créer pour un événement ; la clé d'idempotence est dérivée de l'événement. */
export type OutboxRoute = (
  event: OutboxEvent,
) => Array<Omit<EnqueueInput, "organizationId" | "idempotencyKey">>;

/** Planification périodique (ex. balayage quotidien de conservation) : renvoie un nombre. */
export type JobPlanner = (db: Database) => Promise<number>;

export type WorkerOptions = {
  db: Database;
  workerId: string;
  handlers: Readonly<Record<string, AnyJobHandler>>;
  deadHandlers?: Readonly<Record<string, DeadJobHandler>>;
  routes?: Readonly<Record<string, OutboxRoute>>;
  planners?: readonly JobPlanner[];
  /**
   * Tâches prises ensemble et exécutées en parallèle (une connexion chacune au plus) : à
   * garder sous la taille du pool. Petit, pour que le bail ne coure que sur peu de tâches.
   */
  batchSize?: number;
  /** Bail d'une tâche, prolongé avant chaque appel à un prestataire. */
  leaseSeconds?: number;
  /** Tours de prise par passage : une tâche inscrite par une autre part dans le même passage. */
  rounds?: number;
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

const OUTBOX_BATCH = 20;

function errorCodeOf(error: unknown): JobErrorCode {
  return error instanceof JobError ? error.code : "unexpected_error";
}

function isFinal(error: unknown): boolean {
  return error instanceof JobError && error.final;
}

export function createWorker(options: WorkerOptions) {
  const {
    db,
    handlers,
    deadHandlers = {},
    routes = {},
    planners = [],
    batchSize = 3,
    leaseSeconds = 300,
    rounds = 30,
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
      sql`SELECT event_id, organization_id FROM jobs.pending_outbox(${OUTBOX_BATCH})`,
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

  async function complete(tx: TenantTransaction, job: ClaimedJob) {
    const done = await tx.execute<{ ok: boolean }>(
      sql`SELECT jobs.complete(${job.id}, ${workerId}, ${job.attempt}) AS ok`,
    );
    return done.rows[0]?.ok === true;
  }

  /** Bail prolongé de `leaseSeconds` ; faux s'il a déjà été perdu (tâche reprise ailleurs). */
  async function renewLease(tx: TenantTransaction, job: ClaimedJob) {
    const renewed = await tx
      .update(scheduledJobs)
      .set({
        lockedUntil: sql`now() + make_interval(secs => ${leaseSeconds})`,
      })
      .where(
        and(
          eq(scheduledJobs.id, job.id),
          eq(scheduledJobs.status, "running"),
          eq(scheduledJobs.lockedBy, workerId),
          eq(scheduledJobs.attempts, job.attempt),
        ),
      )
      .returning({ id: scheduledJobs.id });
    return renewed.length === 1;
  }

  /** Exécute la tâche ; vrai si elle est réussie, faux si le bail a été perdu entre-temps. */
  async function execute(job: ClaimedJob): Promise<boolean> {
    const handler = handlers[job.kind];
    const tenant = { organizationId: job.organizationId };
    if (!handler) throw new JobError("unexpected_error");
    if (typeof handler === "function")
      return withTenant(db, tenant, async (tx) => {
        await handler({ tx, job });
        if (!(await complete(tx, job))) throw new LeaseLost();
        return true;
      });
    const read: JobReader = (fn) =>
      withTenant(db, tenant, async (tx) => {
        // Aucun appel au prestataire sans bail valide pour toute sa durée.
        if (!(await renewLease(tx, job))) throw new LeaseLost();
        return fn(tx);
      });
    const prepared = await handler.prepare({ job, read });
    // L'appel a eu lieu : son résultat est écrit même si le bail a expiré entre-temps.
    return withTenant(db, tenant, async (tx) => {
      await handler.commit({ tx, job, prepared });
      return complete(tx, job);
    });
  }

  async function run(job: ClaimedJob): Promise<keyof PassResult> {
    try {
      return (await execute(job)) ? "succeeded" : "lost";
    } catch (error) {
      if (error instanceof LeaseLost) return "lost";
      const code = errorCodeOf(error);
      const status = await withTenant(
        db,
        { organizationId: job.organizationId },
        async (tx) => {
          const result = isFinal(error)
            ? await tx.execute<{ status: string | null }>(
                sql`SELECT CASE WHEN jobs.give_up(${job.id}, ${workerId}, ${job.attempt}, ${code}) THEN 'dead' END AS status`,
              )
            : await tx.execute<{ status: string | null }>(
                sql`SELECT jobs.fail(${job.id}, ${workerId}, ${job.attempt}, ${code}) AS status`,
              );
          const next = result.rows[0]?.status ?? null;
          const onDead = deadHandlers[job.kind];
          if (next === "dead" && onDead) {
            // Un exécutant d'échec en panne n'empêche pas la tâche de passer en échec.
            await tx.execute(sql`SAVEPOINT dead_job_handler`);
            try {
              await onDead({ tx, job, code });
            } catch {
              await tx.execute(sql`ROLLBACK TO SAVEPOINT dead_job_handler`);
            }
          }
          return next;
        },
      );
      if (status === "pending") return "retried";
      if (status === "dead") return "dead";
      return "lost";
    }
  }

  /**
   * Parallèle d'un suivi à l'autre ; dans l'ordre de prise pour un même suivi (les messages
   * d'une conversation partent dans l'ordre où ils ont été écrits).
   */
  async function runBatch(batch: readonly ClaimedJob[]) {
    const lanes = new Map<string, ClaimedJob[]>();
    for (const job of batch) {
      const lane = job.followupId ?? job.id;
      lanes.set(lane, [...(lanes.get(lane) ?? []), job]);
    }
    const outcomes = await Promise.all(
      [...lanes.values()].map(async (jobs) => {
        const done: Array<keyof PassResult> = [];
        for (const job of jobs) done.push(await run(job));
        return done;
      }),
    );
    return outcomes.flat();
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
      for (let round = 0; round < rounds; round += 1) {
        const batch = await claim();
        if (batch.length === 0) break;
        for (const outcome of await runBatch(batch)) result[outcome] += 1;
      }
      return result;
    },
  };
}

export type Worker = ReturnType<typeof createWorker>;
