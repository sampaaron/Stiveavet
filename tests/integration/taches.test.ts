import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  inject,
} from "vitest";

import { createOrganization } from "../../db/seed/cabinets-fictifs";
import { DomainError } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import { ROLE_PERMISSIONS } from "@/domains/equipe/permissions";
import { JobError } from "@/domains/taches/kinds";
import { emit, enqueue } from "@/domains/taches/queue";
import { jobsService } from "@/domains/taches/service";
import { createWorker } from "@/domains/taches/worker";
import type { JobHandler } from "@/domains/taches/worker";
import * as schema from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";

import { errorCode, pools } from "./support/db";

const { app, admin, appDb } = pools();
// Second accès applicatif, pour deux workers réellement concurrents.
const otherApp = new Pool({ connectionString: inject("appUrl"), max: 2 });
const otherDb = drizzle(otherApp, { schema });
afterAll(async () => {
  await app.end();
  await otherApp.end();
  await admin.end();
});

// Cabinet propre à ce fichier ; types de tâche propres aux essais.
const org = randomUUID();
const tag = org.slice(0, 8);
let adminActor: Actor;
let assistantActor: Actor;

beforeAll(async () => {
  const [adminId, assistantId] = await createOrganization(
    appDb,
    org,
    "Cabinet des tâches",
    [
      {
        email: `admin-${tag}@essai.test`,
        displayName: "Dr Essai",
        role: "admin_vet",
      },
      {
        email: `asv-${tag}@essai.test`,
        displayName: "ASV Essai",
        role: "assistant",
      },
    ],
  );
  const actorOf = async (
    membershipId: string | undefined,
    role: Actor["role"],
  ) => {
    const { rows } = await admin.query(
      "SELECT user_id FROM memberships WHERE id = $1",
      [membershipId],
    );
    return {
      organizationId: org,
      userId: (rows[0] as { user_id: string }).user_id,
      membershipId: membershipId ?? "",
      role,
      permissions: new Set(ROLE_PERMISSIONS[role].defaults),
    } satisfies Actor;
  };
  adminActor = await actorOf(adminId, "admin_vet");
  assistantActor = await actorOf(assistantId, "assistant");
});

// Chaque essai repart d'une file vide pour ce cabinet.
beforeEach(async () => {
  await admin.query("DELETE FROM scheduled_jobs WHERE organization_id = $1", [
    org,
  ]);
  await admin.query("DELETE FROM outbox_events WHERE organization_id = $1", [
    org,
  ]);
});

const inOrg = <T>(run: Parameters<typeof withTenant<T>>[2]) =>
  withTenant(appDb, { organizationId: org }, run);

async function addJob(
  kind: string,
  key = `essai:${randomUUID()}`,
  runAt = new Date(Date.now() - 1000),
) {
  return inOrg((tx) =>
    enqueue(tx, { organizationId: org, kind, idempotencyKey: key, runAt }),
  );
}

async function job(id: string) {
  const { rows } = await admin.query(
    `SELECT status, attempts, last_error_code, locked_by, finished_at,
            round(extract(epoch FROM run_at - now()))::int AS delay_s
     FROM scheduled_jobs WHERE id = $1`,
    [id],
  );
  return rows[0] as {
    status: string;
    attempts: number;
    last_error_code: string | null;
    locked_by: string | null;
    finished_at: Date | null;
    delay_s: number;
  };
}

async function attempts(id: string) {
  const { rows } = await admin.query(
    "SELECT attempt_number, outcome, error_code FROM job_attempts WHERE job_id = $1 ORDER BY attempt_number",
    [id],
  );
  return rows as Array<{
    attempt_number: number;
    outcome: string | null;
    error_code: string | null;
  }>;
}

/** Rend une tâche reprogrammée immédiatement due. */
async function makeDue(id: string) {
  await admin.query(
    "UPDATE scheduled_jobs SET run_at = now() - interval '1 second' WHERE id = $1",
    [id],
  );
}

const ok: JobHandler = async () => {};

describe("inscription des tâches", () => {
  it("une même clé d'idempotence n'inscrit qu'une tâche", async () => {
    const key = `essai:${randomUUID()}`;
    const first = await addJob("essai.ping", key);
    const second = await addJob("essai.ping", key);

    expect(first.created).toBe(true);
    expect(second).toEqual({ id: first.id, created: false });
  });

  it("refuse une charge utile qui pourrait porter un e-mail, un numéro ou du texte libre", async () => {
    for (const payload of <Array<Record<string, string>>>[
      { email: "julien@exemple.test" },
      { phone: "+33 6 39 98 41 27" },
      { note: "Saignement sur la cicatrice" },
    ])
      await expect(
        inOrg((tx) =>
          enqueue(tx, {
            organizationId: org,
            kind: "essai.ping",
            idempotencyKey: `essai:${randomUUID()}`,
            runAt: new Date(),
            payload,
          }),
        ),
      ).rejects.toThrow();
  });

  it("refuse un type de tâche ou une clé mal formés", async () => {
    await expect(addJob("Essai Ping")).rejects.toThrow();
    await expect(addJob("essai.ping", "court")).rejects.toThrow();
  });
});

describe("worker", () => {
  it("exécute une tâche due dans la transaction de son cabinet, puis la marque réussie", async () => {
    const { id } = await addJob("essai.ping");
    let seenOrganization: unknown;
    const worker = createWorker({
      db: appDb,
      workerId: "essai-a",
      handlers: {
        "essai.ping": async ({ tx }) => {
          const result = await tx.execute(
            sql`SELECT app.current_organization_id() AS org`,
          );
          seenOrganization = result.rows[0]?.org;
        },
      },
    });

    const result = await worker.runOnce();

    expect(result.succeeded).toBeGreaterThanOrEqual(1);
    expect(seenOrganization).toBe(org);
    expect(await job(id)).toMatchObject({
      status: "succeeded",
      attempts: 1,
      locked_by: null,
    });
    expect(await attempts(id)).toEqual([
      { attempt_number: 1, outcome: "succeeded", error_code: null },
    ]);
  });

  it("ne prend ni une tâche future, ni un type qu'il ne sait pas exécuter", async () => {
    const future = await addJob(
      "essai.ping",
      undefined,
      new Date(Date.now() + 3_600_000),
    );
    const unknown = await addJob("essai.inconnu");
    await createWorker({
      db: appDb,
      workerId: "essai-a",
      handlers: { "essai.ping": ok },
    }).runOnce();

    expect((await job(future.id)).status).toBe("pending");
    expect(await job(unknown.id)).toMatchObject({
      status: "pending",
      attempts: 0,
    });
  });

  it("espace les tentatives (1 min, 5 min, 15 min, 1 h) puis met la tâche en échec", async () => {
    const { id } = await addJob("essai.panne");
    const worker = createWorker({
      db: appDb,
      workerId: "essai-a",
      handlers: {
        "essai.panne": async () => {
          throw new JobError("provider_unavailable");
        },
      },
    });

    const delays: number[] = [];
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await worker.runOnce();
      const state = await job(id);
      expect(state).toMatchObject({
        status: "pending",
        attempts: attempt,
        last_error_code: "provider_unavailable",
      });
      delays.push(state.delay_s);
      await makeDue(id);
    }
    const last = await worker.runOnce();

    expect(delays).toEqual([60, 300, 900, 3600]);
    expect(last.dead).toBeGreaterThanOrEqual(1);
    expect(await job(id)).toMatchObject({ status: "dead", attempts: 5 });
    expect((await attempts(id)).map((a) => a.outcome)).toEqual(
      Array(5).fill("failed"),
    );
  });

  it("n'enregistre qu'un code d'erreur, jamais le message d'une exception", async () => {
    const { id } = await addJob("essai.bug");
    await createWorker({
      db: appDb,
      workerId: "essai-a",
      handlers: {
        "essai.bug": async () => {
          throw new Error("Julien Morel, 06 39 98 41 27 : sang sur la plaie");
        },
      },
    }).runOnce();

    expect((await job(id)).last_error_code).toBe("unexpected_error");
    const { rows } = await admin.query(
      "SELECT count(*)::int AS n FROM job_attempts WHERE job_id = $1 AND error_code = 'unexpected_error'",
      [id],
    );
    expect(rows[0]).toEqual({ n: 1 });
  });

  it("annule les écritures d'une exécution qui échoue", async () => {
    const { id } = await addJob("essai.partiel");
    await createWorker({
      db: appDb,
      workerId: "essai-a",
      handlers: {
        "essai.partiel": async ({ tx }) => {
          await enqueue(tx, {
            organizationId: org,
            kind: "essai.trace",
            idempotencyKey: `trace:${id}`,
            runAt: new Date(Date.now() + 3_600_000),
          });
          throw new JobError("provider_rejected");
        },
      },
    }).runOnce();

    const { rows } = await admin.query(
      "SELECT count(*)::int AS n FROM scheduled_jobs WHERE idempotency_key = $1",
      [`trace:${id}`],
    );
    expect(rows[0]).toEqual({ n: 0 });
  });

  it("deux workers concurrents ne prennent jamais la même tâche", async () => {
    const ids = await Promise.all(
      Array.from({ length: 6 }, () => addJob("essai.compte")),
    );
    const runs = new Map<string, number>();
    const handler: JobHandler = async ({ job: claimed }) => {
      runs.set(claimed.id, (runs.get(claimed.id) ?? 0) + 1);
      await new Promise((resolve) => setTimeout(resolve, 20));
    };
    const options = { handlers: { "essai.compte": handler }, batchSize: 3 };

    await Promise.all([
      createWorker({ ...options, db: appDb, workerId: "essai-a" }).runOnce(),
      createWorker({ ...options, db: otherDb, workerId: "essai-b" }).runOnce(),
    ]);

    expect([...runs.values()].every((n) => n === 1)).toBe(true);
    for (const { id } of ids) expect((await job(id)).status).toBe("succeeded");
  });

  it("reprend une tâche dont le worker s'est arrêté, et l'ancien worker ne peut plus rien écrire", async () => {
    const { id } = await addJob("essai.long");
    // Le worker A prend la tâche puis « tombe » : rien n'est terminé.
    const claimed = await appDb.execute(
      sql`SELECT job_id, attempt FROM jobs.claim('essai-a', ARRAY['essai.long'], 10, 30)`,
    );
    expect(claimed.rows).toHaveLength(1);
    await admin.query(
      "UPDATE scheduled_jobs SET locked_until = now() - interval '1 second' WHERE id = $1",
      [id],
    );

    // Au passage suivant, la tâche est reprogrammée avec le motif « arrêt du worker ».
    await createWorker({
      db: appDb,
      workerId: "essai-b",
      handlers: { "essai.autre": ok },
    }).runOnce();
    expect(await job(id)).toMatchObject({
      status: "pending",
      attempts: 1,
      last_error_code: "lease_expired",
    });

    const late = await inOrg((tx) =>
      tx.execute(sql`SELECT jobs.complete(${id}, 'essai-a', 1) AS ok`),
    );
    expect(late.rows[0]).toEqual({ ok: false });

    await makeDue(id);
    await createWorker({
      db: appDb,
      workerId: "essai-b",
      handlers: { "essai.long": ok },
    }).runOnce();
    expect(await job(id)).toMatchObject({ status: "succeeded", attempts: 2 });
    expect((await attempts(id)).map((a) => [a.outcome, a.error_code])).toEqual([
      ["failed", "lease_expired"],
      ["succeeded", null],
    ]);
  });

  it("panne pendant un envoi : la tentative suivante réutilise la même clé, le prestataire ne reçoit qu'un message", async () => {
    // Prestataire simulé idempotent, comme le seront WhatsApp et l'e-mail.
    const delivered = new Map<string, number>();
    const provider = {
      send(key: string) {
        delivered.set(key, (delivered.get(key) ?? 0) + 1);
      },
    };
    const accepted = new Set<string>();
    let crash = true;
    const { id } = await addJob("essai.envoi");
    const worker = createWorker({
      db: appDb,
      workerId: "essai-a",
      handlers: {
        "essai.envoi": async ({ job: claimed }) => {
          if (!accepted.has(claimed.idempotencyKey)) {
            accepted.add(claimed.idempotencyKey);
            provider.send(claimed.idempotencyKey);
          }
          if (crash) {
            crash = false;
            throw new JobError("provider_unavailable");
          }
        },
      },
    });

    await worker.runOnce();
    await makeDue(id);
    await worker.runOnce();

    expect(await job(id)).toMatchObject({ status: "succeeded", attempts: 2 });
    expect([...delivered.values()]).toEqual([1]);
  });

  it("refuse un identifiant de worker mal formé", async () => {
    expect(() =>
      createWorker({ db: appDb, workerId: "Worker 1", handlers: {} }),
    ).toThrow();
    const code = await errorCode(
      app.query(
        "SELECT * FROM jobs.claim('Worker 1', ARRAY['essai.ping'], 1, 30)",
      ),
    );
    expect(code).toBe("22023");
  });
});

describe("outbox", () => {
  it("publie chaque événement une seule fois, même relu", async () => {
    const aggregateId = randomUUID();
    const eventId = await inOrg((tx) =>
      emit(tx, {
        organizationId: org,
        topic: "essai.evenement",
        aggregateType: "essai",
        aggregateId,
      }),
    );
    const worker = createWorker({
      db: appDb,
      workerId: "essai-a",
      handlers: {},
      routes: {
        "essai.evenement": (event) => [
          {
            kind: "essai.suite",
            runAt: new Date(Date.now() + 60_000),
            payload: { aggregateId: event.aggregateId },
          },
        ],
      },
    });

    const first = await worker.runOnce();
    await worker.runOnce();
    // Relecture forcée (publication perdue après une panne) : aucune tâche en double.
    await admin.query(
      "UPDATE outbox_events SET published_at = NULL WHERE id = $1",
      [eventId],
    );
    await worker.runOnce();

    expect(first.published).toBeGreaterThanOrEqual(1);
    const { rows } = await admin.query(
      "SELECT kind, payload FROM scheduled_jobs WHERE organization_id = $1",
      [org],
    );
    expect(rows).toEqual([{ kind: "essai.suite", payload: { aggregateId } }]);
  });
});

describe("tâches en échec", () => {
  async function deadJob() {
    const { id } = await addJob("essai.mort");
    await admin.query(
      `UPDATE scheduled_jobs SET status = 'dead', attempts = 5, last_error_code = 'provider_unavailable',
       finished_at = now() WHERE id = $1`,
      [id],
    );
    return id;
  }

  it("l'administrateur voit la tâche, sans contenu, et la relance", async () => {
    const id = await deadJob();
    const service = jobsService(appDb);

    const failures = await service.failures(adminActor);
    expect(failures).toEqual([
      expect.objectContaining({
        id,
        label: "Tâche technique",
        errorLabel: "Service d'envoi indisponible",
        attempts: 5,
      }),
    ]);
    expect(await service.failureCount(adminActor)).toBe(1);

    await service.retry(adminActor, id);
    expect(await job(id)).toMatchObject({
      status: "pending",
      attempts: 0,
      finished_at: null,
    });
    const { rows } = await admin.query(
      "SELECT action, metadata FROM audit_events WHERE organization_id = $1 AND target_id = $2",
      [org, id],
    );
    expect(rows).toEqual([
      { action: "job.retried", metadata: { kind: "essai.mort" } },
    ]);
  });

  it("l'administrateur abandonne une tâche ; seule une tâche en échec peut l'être", async () => {
    const id = await deadJob();
    const pending = await addJob(
      "essai.ping",
      undefined,
      new Date(Date.now() + 60_000),
    );
    const service = jobsService(appDb);

    await service.cancel(adminActor, id);
    expect(await job(id)).toMatchObject({ status: "cancelled" });
    await expect(service.cancel(adminActor, pending.id)).rejects.toEqual(
      new DomainError("not_found"),
    );
    await expect(service.retry(adminActor, id)).rejects.toEqual(
      new DomainError("not_found"),
    );
  });

  it("une assistante n'y a pas accès", async () => {
    const id = await deadJob();
    const service = jobsService(appDb);

    await expect(service.failures(assistantActor)).rejects.toEqual(
      new DomainError("not_found"),
    );
    await expect(service.retry(assistantActor, id)).rejects.toEqual(
      new DomainError("not_found"),
    );
    expect(await service.failureCount(assistantActor)).toBe(0);
  });

  it("un autre cabinet ne voit ni ne relance les tâches de celui-ci", async () => {
    const id = await deadJob();
    const { rows } = await admin.query(
      `SELECT m.id, m.user_id FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE u.email = 'claire.fontaine@tilleuls.test'`,
    );
    const claire = rows[0] as { id: string; user_id: string };
    const other: Actor = {
      organizationId: "0b9f2c11-6a3e-4d27-9c40-5e1d8a7b3f01",
      userId: claire.user_id,
      membershipId: claire.id,
      role: "admin_vet",
      permissions: new Set(ROLE_PERMISSIONS.admin_vet.defaults),
    };
    const service = jobsService(appDb);

    expect(
      (await service.failures(other)).some((failure) => failure.id === id),
    ).toBe(false);
    await expect(service.retry(other, id)).rejects.toEqual(
      new DomainError("not_found"),
    );
  });
});

describe("délais entre tentatives", () => {
  it("suivent le calendrier 1 min, 5 min, 15 min, 1 h, 3 h", async () => {
    const { rows } = await app.query(
      "SELECT array_agg(extract(epoch FROM jobs.retry_delay(n))::int ORDER BY n) AS s FROM generate_series(1, 7) n",
    );
    expect(rows[0]).toEqual({ s: [60, 300, 900, 3600, 10800, 10800, 10800] });
  });
});
