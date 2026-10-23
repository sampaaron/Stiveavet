import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SEED, createOrganization } from "../../db/seed/cabinets-fictifs";
import { fictionalPng } from "../support/png";
import { fakeAiGateway } from "@/adapters/ai-gateway/fake";
import { createFakeDrVeto } from "@/adapters/drveto/fake";
import { createMemoryStorage } from "@/adapters/object-storage/memory";
import { fakePaymentMandate } from "@/adapters/payments/fake";
import { conversationsService } from "@/domains/conversations/service";
import type { Actor } from "@/domains/equipe/actor";
import { isPermissionKey } from "@/domains/equipe/permissions";
import { mediaHandlers, mediaService } from "@/domains/fichiers/service";
import { protocolsService } from "@/domains/protocoles/service";
import { settingsService } from "@/domains/reglages/service";
import { SWEEP_KIND, retentionHandlers } from "@/domains/suivis/conservation";
import { launchService } from "@/domains/suivis/lancement";
import { followupEndHandlers } from "@/domains/suivis/rappels";
import { enqueue } from "@/domains/taches/queue";
import { createWorker } from "@/domains/taches/worker";
import { withTenant } from "@/server/db/tenant";

import { asApp, pools } from "./support/db";
import { conversationWorker, recordingWhatsApp } from "./support/whatsapp";

/**
 * Lot 17 : conservation d'un an (cahier des charges §15, architecture §12, ADR 0020).
 * Un suivi arrivé à échéance est effacé avec ses fichiers, son animal et ses propriétaires ;
 * seules des statistiques anonymisées restent. L'application ne peut rien effacer autrement.
 */

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

const HOUR = 3_600_000;
const drveto = createFakeDrVeto();
const storage = createMemoryStorage();
const launches = launchService({ db: appDb, drveto });
const conversations = conversationsService(appDb);
const media = mediaService({
  db: appDb,
  storage,
  linkSecret: "clé-des-liens-du-test-".repeat(3),
});
const settings = settingsService({
  db: appDb,
  whatsapp: { live: false },
  drveto,
  payments: fakePaymentMandate,
});
const protocols = protocolsService(appDb);

const org = randomUUID();
const tag = org.slice(0, 8);
let vetId: string;

const { worker } = conversationWorker({
  db: appDb,
  workerId: "test-conservation",
  organizationId: () => org,
  whatsapp: recordingWhatsApp(),
  ai: fakeAiGateway,
  extra: {
    ...followupEndHandlers(),
    ...mediaHandlers({ storage, ai: fakeAiGateway }),
    ...retentionHandlers({ storage }),
  },
});

async function drain() {
  for (let pass = 0; pass < 5; pass += 1) await worker.runOnce();
}

async function actor(membershipId: string): Promise<Actor> {
  const { rows } = await admin.query(
    `SELECT m.user_id, m.role, array_remove(array_agg(p.permission), NULL) AS permissions
     FROM memberships m LEFT JOIN membership_permissions p ON p.membership_id = m.id
     WHERE m.id = $1 GROUP BY m.id`,
    [membershipId],
  );
  const row = rows[0] as
    { user_id: string; role: Actor["role"]; permissions: string[] } | undefined;
  if (!row) throw new Error("membre inconnu");
  return {
    organizationId: org,
    userId: row.user_id,
    membershipId,
    role: row.role,
    permissions: new Set(row.permissions.filter(isPermissionKey)),
  };
}

/** Lance un suivi, premier message, accord du propriétaire, puis une réponse de sa part. */
async function launchWithConsent(ref: string): Promise<string> {
  const vet = await actor(vetId);
  const id = await launches.prepare(vet, ref);
  let sheet = await launches.sheet(vet, id);
  if (!sheet.protocol) {
    const option = sheet.protocolOptions[0];
    if (!option) throw new Error("aucun protocole");
    await launches.applyProtocol(vet, id, option.protocolId);
    sheet = await launches.sheet(vet, id);
  }
  const hoursSince = Math.ceil(
    (Date.now() - sheet.followup.procedureAt.getTime()) / HOUR,
  );
  await launches.save(
    vet,
    id,
    {
      firstContactHours: hoursSince + 1,
      controlAppointmentAt: sheet.followup.controlAppointmentAt,
      steps: sheet.steps
        .filter((step) => !step.locked)
        .map(({ offsetHours, kind, content }) => ({
          offsetHours,
          kind,
          content,
        })),
      alerts: sheet.alerts,
      validateTreatmentIds: [],
      removeTreatmentIds: [],
      addTreatments: [],
      whatsappOptIn: true,
    },
    { launch: true },
  );
  await conversations.makeDueNow(vet, id);
  await drain();
  await conversations.receiveOwnerMessage(org, id, "OUI");
  await drain();
  return id;
}

/** Termine un suivi (fin automatique) à une date passée. */
async function endedAgo(followupId: string, days: number) {
  const client = await admin.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('app.status_reason', 'control_date_reached', true)",
    );
    await client.query(
      `UPDATE followups SET status = 'ended', ended_at = now() - make_interval(days => $2),
         started_at = now() - make_interval(days => $2 + 10)
       WHERE id = $1`,
      [followupId, days],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function exists(table: string, column: string, id: string) {
  const { rows } = await admin.query(
    `SELECT count(*)::int AS n FROM ${table} WHERE ${column} = $1`,
    [id],
  );
  return (rows[0] as { n: number }).n;
}

async function sqlState(
  promise: Promise<unknown>,
): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

let plume: string;
let tango: string;
let biscotte: string;
let photoKey: string;
let plumeAnimal: string;
let plumeOwners: string[];

beforeAll(async () => {
  const [adminId, vet] = await createOrganization(
    appDb,
    org,
    "Clinique d'essai de la conservation",
    [
      {
        email: `ca-${tag}@essai.test`,
        displayName: "Dr Lou Admin",
        role: "admin_vet",
      },
      { email: `cv-${tag}@essai.test`, displayName: "Dr Léo Vet", role: "vet" },
    ],
  );
  if (!adminId || !vet) throw new Error("cabinet");
  vetId = vet;
  const lou = await actor(adminId);
  await settings.connect(lou, "drveto", "ESSAI-06");
  await settings.connect(lou, "whatsapp", "06 39 98 00 05");
  for (const key of ["sterilisation-chatte", "sterilisation-chienne"]) {
    const id = await protocols.installFromLibrary(lou, key);
    await protocols.validate(lou, id);
  }

  plume = await launchWithConsent("DV-20481");
  await media.receiveOwnerMedia(org, plume, {
    kind: "photo",
    bytes: fictionalPng(),
  });
  await drain();
  const { rows: files } = await admin.query(
    "SELECT storage_key FROM attachments WHERE followup_id = $1",
    [plume],
  );
  photoKey = (files[0] as { storage_key: string }).storage_key;
  const { rows: animal } = await admin.query(
    "SELECT animal_id FROM followups WHERE id = $1",
    [plume],
  );
  plumeAnimal = (animal[0] as { animal_id: string }).animal_id;
  const { rows: owners } = await admin.query(
    "SELECT owner_id FROM followup_contacts WHERE followup_id = $1",
    [plume],
  );
  plumeOwners = owners.map((row) => (row as { owner_id: string }).owner_id);
  // Plume a eu une demande de rendez-vous traitée par Numa : elle ne bloque plus l'effacement.
  const { rows: asked } = await admin.query(
    `SELECT m.id AS message_id, m.thread_id, m.followup_contact_id
     FROM messages m WHERE m.followup_id = $1 AND m.author = 'owner' LIMIT 1`,
    [plume],
  );
  const request = asked[0] as {
    message_id: string;
    thread_id: string;
    followup_contact_id: string;
  };
  const { rows: booked } = await admin.query(
    `INSERT INTO appointments (organization_id, followup_id, animal_id, membership_id, kind, source,
       starts_at, ends_at)
     VALUES ($1, $2, $3, $4, 'post_op_control', 'drveto', now() + interval '2 days',
       now() + interval '2 days 20 minutes')
     RETURNING id`,
    [org, plume, plumeAnimal, vetId],
  );
  await admin.query(
    `INSERT INTO appointment_requests (organization_id, followup_id, followup_contact_id, thread_id,
       request_message_id, membership_id, kind, minutes, status, appointment_id)
     VALUES ($1, $2, $3, $4, $5, $6, 'post_op_control', 20, 'chosen', $7)`,
    [
      org,
      plume,
      request.followup_contact_id,
      request.thread_id,
      request.message_id,
      vetId,
      (booked[0] as { id: string }).id,
    ],
  );

  tango = await launchWithConsent("DV-20560");
  biscotte = await launchWithConsent("DV-20574");

  // Plume : terminé il y a plus d'un an. Tango : terminé il y a onze mois.
  // Biscotte : jamais terminé, créé il y a seize mois (plafond de quinze mois).
  await endedAgo(plume, 370);
  await endedAgo(tango, 330);
  await admin.query(
    "UPDATE followups SET created_at = now() - interval '16 months' WHERE id = $1",
    [biscotte],
  );
});

describe("l'application ne peut rien effacer hors de l'échéance", () => {
  it("ni suivi ni animal supprimés directement, statistiques illisibles", async () => {
    expect(
      await sqlState(
        asApp(app, org, (client) =>
          client.query("DELETE FROM followups WHERE id = $1", [plume]),
        ),
      ),
    ).toBe("42501");
    expect(
      await sqlState(
        asApp(app, org, (client) =>
          client.query("DELETE FROM animals WHERE id = $1", [plumeAnimal]),
        ),
      ),
    ).toBe("42501");
    expect(
      await sqlState(
        asApp(app, org, (client) =>
          client.query("SELECT count(*) FROM stats.followup_outcomes"),
        ),
      ),
    ).toBe("42501");
  });

  it("l'effacement exige un cabinet et ne touche jamais un autre cabinet", async () => {
    expect(
      await sqlState(
        asApp(app, null, (client) =>
          client.query("SELECT app.purge_followup($1)", [plume]),
        ),
      ),
    ).toBe("42501");
    const crossed = await asApp(app, SEED.tilleuls, async (client) => {
      const { rows } = await client.query(
        "SELECT app.purge_followup($1) AS purged",
        [plume],
      );
      return (rows[0] as { purged: boolean }).purged;
    });
    expect(crossed).toBe(false);
  });

  it("un suivi pas encore dû n'est pas effacé", async () => {
    const purged = await asApp(app, org, async (client) => {
      const { rows } = await client.query(
        "SELECT app.purge_followup($1) AS purged",
        [tango],
      );
      return (rows[0] as { purged: boolean }).purged;
    });
    expect(purged).toBe(false);
    expect(await exists("followups", "id", tango)).toBe(1);
  });

  it("une seule planification par jour, une tâche par cabinet", async () => {
    await asApp(app, null, async (client) => {
      const first = await client.query(
        "SELECT jobs.plan_retention_sweeps() AS planned",
      );
      const again = await client.query(
        "SELECT jobs.plan_retention_sweeps() AS planned",
      );
      expect((first.rows[0] as { planned: number }).planned).toBeGreaterThan(1);
      expect((again.rows[0] as { planned: number }).planned).toBe(0);
    });
  });
});

describe("balayage quotidien", () => {
  it("efface les suivis dus, leurs fichiers, l'animal et les propriétaires ; garde des statistiques", async () => {
    const { rows: before } = await admin.query(
      "SELECT count(*)::int AS n FROM stats.followup_outcomes",
    );
    expect(storage.keys()).toContain(photoKey);
    expect(await exists("usage_events", "followup_id", plume)).toBe(1);

    await withTenant(appDb, { organizationId: org }, (tx) =>
      enqueue(tx, {
        organizationId: org,
        kind: SWEEP_KIND,
        idempotencyKey: `retention:essai-${tag}`,
        runAt: new Date(),
        followupId: null,
      }),
    );
    await drain();

    // Plume (un an après la fin) et Biscotte (quinze mois) : effacés ; Tango reste.
    expect(await exists("followups", "id", plume)).toBe(0);
    expect(await exists("followups", "id", biscotte)).toBe(0);
    expect(await exists("followups", "id", tango)).toBe(1);
    expect(storage.keys()).not.toContain(photoKey);
    for (const table of [
      "messages",
      "attachments",
      "consents",
      "followup_contacts",
      "triage_events",
      "scheduled_jobs",
      "followup_syntheses",
      "appointments",
      "appointment_requests",
    ])
      expect(await exists(table, "followup_id", plume), table).toBe(0);
    expect(await exists("animals", "id", plumeAnimal)).toBe(0);
    for (const owner of plumeOwners)
      expect(await exists("owners", "id", owner)).toBe(0);
    // Pièce comptable : l'usage facturé reste, par simple référence.
    expect(await exists("usage_events", "followup_id", plume)).toBe(1);

    const { rows: audit } = await admin.query(
      `SELECT target_id, actor_membership_id, metadata FROM audit_events
       WHERE organization_id = $1 AND action = 'followup.purged' ORDER BY target_id`,
      [org],
    );
    expect(audit).toEqual(
      [
        { target_id: plume, actor_membership_id: null, metadata: { files: 1 } },
        {
          target_id: biscotte,
          actor_membership_id: null,
          metadata: { files: 0 },
        },
      ].sort((a, b) => a.target_id.localeCompare(b.target_id)),
    );

    const { rows: after } = await admin.query(
      `SELECT started_month, species, protocol_kind, duration_days, ended_automatically,
              consent_given, owner_messages, photos, max_triage
       FROM stats.followup_outcomes ORDER BY id`,
    );
    expect(after.length - (before[0] as { n: number }).n).toBe(2);
    expect(after).toContainEqual(
      expect.objectContaining({
        species: "cat",
        protocol_kind: "sterilisation-chatte",
        duration_days: 10,
        ended_automatically: true,
        consent_given: true,
        photos: 1,
      }),
    );
    expect(after).toContainEqual(
      expect.objectContaining({
        species: "dog",
        duration_days: null,
        ended_automatically: false,
        consent_given: true,
        photos: 0,
      }),
    );
  });

  it("un second balayage ne trouve plus rien à effacer", async () => {
    await withTenant(appDb, { organizationId: org }, (tx) =>
      enqueue(tx, {
        organizationId: org,
        kind: SWEEP_KIND,
        idempotencyKey: `retention:essai-bis-${tag}`,
        runAt: new Date(),
        followupId: null,
      }),
    );
    await drain();
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM audit_events
       WHERE organization_id = $1 AND action = 'followup.purged'`,
      [org],
    );
    expect((rows[0] as { n: number }).n).toBe(2);
    expect(await exists("followups", "id", tango)).toBe(1);
  });
});

describe("conservation renforcée (ADR 0038)", () => {
  const handlers = retentionHandlers({ storage });
  const sweepHandler = handlers[SWEEP_KIND];
  if (!sweepHandler) throw new Error("balayage attendu");
  /** Worker qui ne fait que balayer : l'effacement qu'il programme attend. */
  const sweepOnly = createWorker({
    db: appDb,
    workerId: "test-balayage-seul",
    handlers: {
      [SWEEP_KIND]: async (context) => {
        if (context.job.organizationId === org) await sweepHandler(context);
      },
    },
  });

  async function sweep(key: string, run: () => Promise<unknown> = drain) {
    await withTenant(appDb, { organizationId: org }, (tx) =>
      enqueue(tx, {
        organizationId: org,
        kind: SWEEP_KIND,
        idempotencyKey: `retention:${key}-${tag}`,
        runAt: new Date(),
        followupId: null,
      }),
    );
    await run();
  }

  async function oldAnimal(name: string): Promise<string> {
    const { rows } = await admin.query(
      `INSERT INTO animals (organization_id, name, species, created_at)
       VALUES ($1, $2, 'dog', now() - interval '16 months') RETURNING id`,
      [org, name],
    );
    return (rows[0] as { id: string }).id;
  }

  const purgeJobs = async (followupId: string) => {
    const { rows } = await admin.query(
      `SELECT status FROM scheduled_jobs
       WHERE kind = 'followup.purge' AND payload ->> 'followupId' = $1 ORDER BY created_at`,
      [followupId],
    );
    return rows.map((row) => (row as { status: string }).status);
  };

  it("un effacement en échec est retenté par le balayage suivant, sans doublon entre-temps", async () => {
    const animal = await oldAnimal("Brouillon oublié");
    const { rows } = await admin.query(
      `INSERT INTO followups (organization_id, animal_id, responsible_membership_id, procedure,
         procedure_at, created_at)
       VALUES ($1, $2, $3, 'Intervention fictive', now() - interval '16 months',
         now() - interval '16 months')
       RETURNING id`,
      [org, animal, vetId],
    );
    const forgotten = (rows[0] as { id: string }).id;

    await sweep("echec-a", () => sweepOnly.runOnce());
    await sweep("echec-b", () => sweepOnly.runOnce());
    expect(await purgeJobs(forgotten)).toEqual(["pending"]);

    // Cinq échecs plus tard, la tâche est en échec.
    await admin.query(
      `UPDATE scheduled_jobs SET status = 'dead', finished_at = now(),
         last_error_code = 'provider_unavailable'
       WHERE kind = 'followup.purge' AND payload ->> 'followupId' = $1`,
      [forgotten],
    );
    await sweep("echec-c");
    expect(await purgeJobs(forgotten)).toEqual(["dead", "succeeded"]);
    expect(await exists("followups", "id", forgotten)).toBe(0);
    expect(await exists("animals", "id", animal)).toBe(0);
  });

  it("efface les rendez-vous hors suivi finis depuis un an, puis l'animal et ses propriétaires", async () => {
    const gone = await oldAnimal("Ancien patient");
    const kept = await oldAnimal("Patient récent");
    const { rows: owner } = await admin.query(
      "INSERT INTO owners (organization_id, full_name) VALUES ($1, 'Propriétaire ancien') RETURNING id",
      [org],
    );
    const ownerId = (owner[0] as { id: string }).id;
    await admin.query(
      "INSERT INTO animal_owners (organization_id, animal_id, owner_id) VALUES ($1, $2, $3)",
      [org, gone, ownerId],
    );
    for (const [animal, ago] of [
      [gone, "13 months"],
      [kept, "6 months"],
    ] as const)
      await admin.query(
        `INSERT INTO appointments (organization_id, animal_id, membership_id, kind, source,
           starts_at, ends_at)
         VALUES ($1, $2, $3, 'other', 'drveto', now() - $4::interval,
           now() - $4::interval + interval '30 minutes')`,
        [org, animal, vetId, ago],
      );

    await sweep("rendez-vous");

    expect(await exists("appointments", "animal_id", gone)).toBe(0);
    expect(await exists("animals", "id", gone)).toBe(0);
    expect(await exists("owners", "id", ownerId)).toBe(0);
    expect(await exists("appointments", "animal_id", kept)).toBe(1);
    expect(await exists("animals", "id", kept)).toBe(1);
  });

  it("efface les traces techniques de plus de 90 jours, garde les récentes", async () => {
    const ids: Record<string, string> = {};
    for (const [label, ago] of [
      ["old", "100 days"],
      ["new", "10 days"],
    ] as const) {
      const { rows: job } = await admin.query(
        `INSERT INTO scheduled_jobs (organization_id, kind, idempotency_key, status, run_at,
           attempts, finished_at)
         VALUES ($1, 'test.noop', $2, 'succeeded', now() - $3::interval, 1, now() - $3::interval)
         RETURNING id`,
        [org, `essai:${label}:${tag}`, ago],
      );
      ids[`job-${label}`] = (job[0] as { id: string }).id;
      await admin.query(
        `INSERT INTO job_attempts (organization_id, job_id, attempt_number, finished_at, outcome)
         VALUES ($1, $2, 1, now() - $3::interval, 'succeeded')`,
        [org, ids[`job-${label}`], ago],
      );
      const { rows: event } = await admin.query(
        `INSERT INTO outbox_events (organization_id, topic, aggregate_type, aggregate_id,
           created_at, published_at)
         VALUES ($1, 'test.noop', 'essai', gen_random_uuid(), now() - $2::interval,
           now() - $2::interval)
         RETURNING id`,
        [org, ago],
      );
      ids[`event-${label}`] = (event[0] as { id: string }).id;
      const { rows: hook } = await admin.query(
        `INSERT INTO webhook_events (organization_id, provider, event_key, kind, received_at)
         VALUES ($1, 'whatsapp', $2, 'message', now() - $3::interval) RETURNING id`,
        [org, `essai-${label}-${tag}`, ago],
      );
      ids[`hook-${label}`] = (hook[0] as { id: string }).id;
      const { rows: delivery } = await admin.query(
        `INSERT INTO notification_deliveries (organization_id, channel, recipient_membership_id,
           idempotency_key, status, created_at)
         VALUES ($1, 'email', $2, $3, 'sent', now() - $4::interval) RETURNING id`,
        [org, vetId, `livraison:${label}:${tag}`, ago],
      );
      ids[`delivery-${label}`] = (delivery[0] as { id: string }).id;
    }

    await sweep("technique");

    const counts = async (label: string) => [
      await exists("scheduled_jobs", "id", ids[`job-${label}`] ?? ""),
      await exists("job_attempts", "job_id", ids[`job-${label}`] ?? ""),
      await exists("outbox_events", "id", ids[`event-${label}`] ?? ""),
      await exists("webhook_events", "id", ids[`hook-${label}`] ?? ""),
      await exists(
        "notification_deliveries",
        "id",
        ids[`delivery-${label}`] ?? "",
      ),
    ];
    expect(await counts("old")).toEqual([0, 0, 0, 0, 0]);
    expect(await counts("new")).toEqual([1, 1, 1, 1, 1]);
  });

  it("le premier passage du jour purge les traces d'authentification échues", async () => {
    const { rows: member } = await admin.query(
      "SELECT user_id FROM memberships WHERE id = $1",
      [vetId],
    );
    const userId = (member[0] as { user_id: string }).user_id;
    const client = await admin.connect();
    try {
      await client.query("BEGIN");
      for (const [label, expires] of [
        ["old", "now() - interval '40 days'"],
        ["new", "now() + interval '1 day'"],
      ] as const)
        await client.query(
          `INSERT INTO auth.sessions (token_hash, user_id, organization_id, membership_id, expires_at)
           VALUES (sha256($1::bytea), $2, $3, $4, ${expires})`,
          [`session-${label}-${tag}`, userId, org, vetId],
        );
      await client.query(
        `INSERT INTO login_events (organization_id, user_id, kind, occurred_at) VALUES
           ($1, $2, 'logout', now() - interval '13 months'),
           ($1, $2, 'logout', now() - interval '11 months')`,
        [org, userId],
      );
      await client.query(
        `INSERT INTO auth.rate_limits (bucket, window_started_at, hits)
         VALUES ('login_per_ip:' || encode(sha256($1::bytea), 'hex'), now() - interval '2 days', 3)`,
        [`ip-${tag}`],
      );
      await client.query("DELETE FROM jobs.daily_runs");
      await client.query("SET LOCAL ROLE stivea_app");
      await client.query("SELECT jobs.plan_retention_sweeps()");
      await client.query("RESET ROLE");

      const { rows } = await client.query(
        `SELECT
           (SELECT count(*)::int FROM auth.sessions WHERE user_id = $1 AND organization_id = $2) AS sessions,
           (SELECT count(*)::int FROM login_events WHERE user_id = $1 AND kind = 'logout') AS events,
           (SELECT count(*)::int FROM auth.rate_limits
            WHERE bucket = 'login_per_ip:' || encode(sha256($3::bytea), 'hex')) AS limits`,
        [userId, org, `ip-${tag}`],
      );
      expect(rows[0]).toEqual({ sessions: 1, events: 1, limits: 0 });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
