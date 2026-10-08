import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SEED, createOrganization } from "../../db/seed/cabinets-fictifs";
import { fictionalPng } from "../support/png";
import { fakeAiGateway } from "@/adapters/ai-gateway/fake";
import { createFakeDrVeto } from "@/adapters/drveto/fake";
import { createMemoryStorage } from "@/adapters/object-storage/memory";
import { fakePaymentMandate } from "@/adapters/payments/fake";
import { fakeWhatsApp } from "@/adapters/whatsapp/fake";
import {
  conversationHandlers,
  conversationsService,
} from "@/domains/conversations/service";
import type { Actor } from "@/domains/equipe/actor";
import { isPermissionKey } from "@/domains/equipe/permissions";
import { mediaHandlers, mediaService } from "@/domains/fichiers/service";
import { protocolsService } from "@/domains/protocoles/service";
import { settingsService } from "@/domains/reglages/service";
import { SWEEP_KIND, retentionHandlers } from "@/domains/suivis/conservation";
import { launchService } from "@/domains/suivis/lancement";
import { followupEndHandlers } from "@/domains/suivis/rappels";
import { enqueue } from "@/domains/taches/queue";
import type { JobHandler } from "@/domains/taches/worker";
import { createWorker } from "@/domains/taches/worker";
import { alertHandlers } from "@/domains/urgences/service";
import { withTenant } from "@/server/db/tenant";

import { asApp, pools } from "./support/db";

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
  whatsapp: fakeWhatsApp,
  drveto,
  payments: fakePaymentMandate,
});
const protocols = protocolsService(appDb);

const org = randomUUID();
const tag = org.slice(0, 8);
let vetId: string;

const allHandlers: Record<string, JobHandler> = {
  ...conversationHandlers({ whatsapp: fakeWhatsApp, ai: fakeAiGateway }),
  ...alertHandlers({ whatsapp: fakeWhatsApp }),
  ...followupEndHandlers(),
  ...mediaHandlers({ storage, ai: fakeAiGateway }),
  ...retentionHandlers({ storage }),
};
const worker = createWorker({
  db: appDb,
  workerId: "test-conservation",
  handlers: Object.fromEntries(
    Object.entries(allHandlers).map(([kind, handler]) => [
      kind,
      (async (context) => {
        if (context.job.organizationId === org) await handler(context);
      }) satisfies JobHandler,
    ]),
  ),
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
