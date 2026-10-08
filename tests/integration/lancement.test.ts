import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createOrganization } from "../../db/seed/cabinets-fictifs";
import { createFakeDrVeto } from "@/adapters/drveto/fake";
import { fakePaymentMandate } from "@/adapters/payments/fake";
import { DomainError } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import { isPermissionKey } from "@/domains/equipe/permissions";
import { protocolsService } from "@/domains/protocoles/service";
import { settingsService } from "@/domains/reglages/service";
import { launchService, reminderTreatments } from "@/domains/suivis/lancement";
import type { SheetInput } from "@/domains/suivis/plan";
import { withTenant } from "@/server/db/tenant";

import { asApp, errorCode, pools } from "./support/db";

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

const HOUR = 3_600_000;
// Horloge figée : l'intervention de Plume a eu lieu 2 h avant.
const NOW = new Date("2026-10-07T12:00:00Z");
const drveto = createFakeDrVeto(() => NOW);
const service = launchService({ db: appDb, drveto });
const settings = settingsService({
  db: appDb,
  whatsapp: { live: false },
  drveto,
  payments: fakePaymentMandate,
});
const protocols = protocolsService(appDb);

const org = randomUUID();
const other = randomUUID();
const tag = org.slice(0, 8);
let ids: { admin: string; vet: string; assistant: string; outsider: string };

beforeAll(async () => {
  const [adminId, vet, assistant] = await createOrganization(
    appDb,
    org,
    "Clinique d'essai du lancement",
    [
      {
        email: `la-${tag}@essai.test`,
        displayName: "Dr Lou Admin",
        role: "admin_vet",
      },
      { email: `lv-${tag}@essai.test`, displayName: "Dr Léo Vet", role: "vet" },
      {
        email: `las-${tag}@essai.test`,
        displayName: "Lina Asv",
        role: "assistant",
      },
    ],
  );
  const [outsider] = await createOrganization(appDb, other, "Autre cabinet", [
    {
      email: `lo-${tag}@essai.test`,
      displayName: "Dr Olga Autre",
      role: "admin_vet",
    },
  ]);
  if (!adminId || !vet || !assistant || !outsider) throw new Error("cabinet");
  ids = { admin: adminId, vet, assistant, outsider };
  // L'assistante reçoit les droits optionnels de préparation et de lecture clinique.
  for (const permission of ["followups.launch", "clinical.read"])
    await admin.query(
      "INSERT INTO membership_permissions (organization_id, membership_id, permission) VALUES ($1, $2, $3)",
      [org, assistant, permission],
    );
  const lou = await actor(adminId);
  for (const key of [
    "sterilisation-chatte",
    "sterilisation-chienne",
    "detartrage",
  ]) {
    const id = await protocols.installFromLibrary(lou, key);
    await protocols.validate(lou, id);
  }
});

async function actor(
  membershipId: string,
  organizationId = org,
): Promise<Actor> {
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
    organizationId,
    userId: row.user_id,
    membershipId,
    role: row.role,
    permissions: new Set(row.permissions.filter(isPermissionKey)),
  };
}

async function domainError(promise: Promise<unknown>) {
  try {
    await promise;
    return undefined;
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
}

async function auditOf(followupId: string) {
  const { rows } = await admin.query(
    `SELECT action, metadata FROM audit_events WHERE target_id = $1 ORDER BY occurred_at, id`,
    [followupId],
  );
  return rows as { action: string; metadata: Record<string, unknown> }[];
}

async function statusEvents(followupId: string) {
  const { rows } = await admin.query(
    `SELECT from_status, to_status, reason FROM followup_status_events
     WHERE followup_id = $1 ORDER BY occurred_at, to_status`,
    [followupId],
  );
  return rows as {
    from_status: string | null;
    to_status: string;
    reason: string | null;
  }[];
}

/** Fiche telle que l'écran la renverrait, avec des modifications ciblées. */
async function sheetInputOf(
  who: Actor,
  followupId: string,
  patch: Partial<SheetInput> = {},
): Promise<SheetInput> {
  const sheet = await service.sheet(who, followupId);
  return {
    firstContactHours:
      sheet.followup.status === "draft"
        ? sheet.followup.firstContactHours
        : undefined,
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
    ...patch,
  };
}

let plume: string;

describe("recherche et import depuis dr.veto (simulé)", () => {
  it("exige la connexion dr.veto du cabinet", async () => {
    const leo = await actor(ids.vet);
    expect(await domainError(service.search(leo, "plume"))).toBe(
      "integration_missing",
    );
    const lou = await actor(ids.admin);
    await settings.connect(lou, "drveto", "ESSAI-01");
  });

  it("cherche par animal, propriétaire ou identifiant ; refuse sans droit de lancement", async () => {
    const leo = await actor(ids.vet);
    const byAnimal = await service.search(leo, "PLUME");
    expect(byAnimal.map((hit) => hit.ref)).toEqual(["DV-20481"]);
    expect(byAnimal[0]?.openFollowupId).toBeNull();
    expect(
      (await service.search(leo, "girard")).map((hit) => hit.name),
    ).toEqual(["Gaston"]);
    expect(await service.search(leo, "x")).toEqual([]);

    const lina = await actor(ids.assistant);
    const plain: Actor = {
      ...lina,
      permissions: new Set(
        [...lina.permissions].filter((key) => key !== "followups.launch"),
      ),
    };
    expect(await domainError(service.search(plain, "plume"))).toBe("not_found");
  });

  it("prépare un brouillon : résumé figé, contacts, traitements à valider, protocole proposé", async () => {
    const leo = await actor(ids.vet);
    plume = await service.prepare(leo, "DV-20481");
    const sheet = await service.sheet(leo, plume);
    expect(sheet.followup).toMatchObject({
      status: "draft",
      animalName: "Plume",
      species: "cat",
      procedure: "Ovariectomie",
      responsibleMembershipId: ids.vet,
      firstContactHours: 3,
    });
    expect(sheet.followup.procedureAt).toEqual(
      new Date(NOW.getTime() - 2 * HOUR),
    );
    expect(sheet.imported).toMatchObject({
      externalRef: "DV-20481",
      allergies: [],
      antecedents: ["Coryza à 4 mois, guéri"],
    });
    expect(sheet.contacts).toEqual([
      {
        name: "Margaux Lemaire",
        role: "primary",
        active: true,
        phone: "•• •• •• •• 01",
        language: "fr",
        optedIn: false,
      },
    ]);
    expect(sheet.treatments).toHaveLength(1);
    expect(sheet.treatments[0]).toMatchObject({
      source: "drveto",
      validatedAt: null,
    });
    expect(sheet.protocol?.name).toBe("Stérilisation de la chatte");
    expect(sheet.steps.length).toBeGreaterThan(1);
    expect(sheet.alerts.length).toBeGreaterThan(0);
    // Le détartrage (chien et chat) est proposé ; aucun protocole réservé au chien.
    expect(sheet.protocolOptions.map((option) => option.name)).toEqual([
      "Détartrage et soins dentaires",
      "Stérilisation de la chatte",
    ]);
    expect(sheet.rights).toEqual({
      canEdit: true,
      canSteer: true,
      canLaunch: true,
    });
    expect((await auditOf(plume)).map((event) => event.action)).toContain(
      "followup.prepared",
    );
  });

  it("un même animal n'a qu'un suivi ouvert à la fois", async () => {
    const lou = await actor(ids.admin);
    expect(await domainError(service.prepare(lou, "DV-20481"))).toBe(
      "already_followed",
    );
    const [hit] = await service.search(lou, "plume");
    expect(hit?.openFollowupId).toBe(plume);
    expect(await domainError(service.prepare(lou, "DV-99999"))).toBe(
      "invalid_target",
    );
  });

  it("le résumé importé ne se modifie pas", async () => {
    const code = await errorCode(
      asApp(app, org, (client) =>
        client.query(
          "UPDATE followup_imports SET allergies = '{}' WHERE followup_id = $1",
          [plume],
        ),
      ),
    );
    expect(code).toBe("42501");
  });
});

describe("fiche de lancement", () => {
  it("l'assistante prépare la fiche, sans valider de traitement ni lancer", async () => {
    const lina = await actor(ids.assistant);
    const sheet = await service.sheet(lina, plume);
    expect(sheet.rights).toEqual({
      canEdit: true,
      canSteer: false,
      canLaunch: false,
    });
    const input = await sheetInputOf(lina, plume, {
      alerts: [{ level: "urgent", description: "Saignement de la plaie" }],
    });
    await service.save(lina, plume, input, { launch: false }, NOW);
    expect((await service.sheet(lina, plume)).alerts).toEqual([
      { level: "urgent", description: "Saignement de la plaie" },
    ]);
    const treatmentId = sheet.treatments[0]?.id ?? "";
    expect(
      await domainError(
        service.save(
          lina,
          plume,
          { ...input, validateTreatmentIds: [treatmentId] },
          { launch: false },
          NOW,
        ),
      ),
    ).toBe("forbidden");
    expect(
      await domainError(
        service.save(lina, plume, input, { launch: true }, NOW),
      ),
    ).toBe("forbidden");
  });

  it("un traitement importé n'est rappelé qu'après validation par un vétérinaire", async () => {
    const leo = await actor(ids.vet);
    const sheet = await service.sheet(leo, plume);
    const treatmentId = sheet.treatments[0]?.id ?? "";
    const eligible = () =>
      withTenant(appDb, { organizationId: org }, (tx) =>
        reminderTreatments(tx, plume),
      );
    expect(await eligible()).toEqual([]);

    await service.save(
      leo,
      plume,
      await sheetInputOf(leo, plume, {
        validateTreatmentIds: [treatmentId],
        addTreatments: [
          { name: "Collerette", instructions: "Jour et nuit pendant 10 jours" },
        ],
      }),
      { launch: false },
      NOW,
    );
    const after = await service.sheet(leo, plume);
    expect(after.treatments.map((t) => [t.source, t.validatedBy])).toEqual([
      ["drveto", "Dr Léo Vet"],
      ["vet", "Dr Léo Vet"],
    ]);
    expect((await eligible()).map((t) => t.name)).toEqual([
      "Anti-inflammatoire (exemple fictif)",
      "Collerette",
    ]);
    const actions = (await auditOf(plume)).map((event) => event.action);
    expect(actions).toContain("followup.treatments_validated");

    // Une validation est définitive (la base le vérifie).
    const code = await errorCode(
      asApp(app, org, (client) =>
        client.query(
          "UPDATE followup_treatments SET validated_at = NULL, validated_by_membership_id = NULL WHERE id = $1",
          [treatmentId],
        ),
      ),
    );
    expect(code).toBe("23514");
  });

  it("changer de protocole repart de sa version ; refuse un protocole d'une autre espèce", async () => {
    const leo = await actor(ids.vet);
    const sheet = await service.sheet(leo, plume);
    const detartrage = sheet.protocolOptions.find((o) =>
      o.name.startsWith("Détartrage"),
    );
    const sterilisation = sheet.protocolOptions.find(
      (o) => !o.name.startsWith("Détartrage"),
    );
    if (!detartrage || !sterilisation) throw new Error("protocoles");
    await service.applyProtocol(leo, plume, detartrage.protocolId);
    expect((await service.sheet(leo, plume)).protocol?.name).toBe(
      "Détartrage et soins dentaires",
    );
    await service.applyProtocol(leo, plume, sterilisation.protocolId);
    const back = await service.sheet(leo, plume);
    expect(back.protocol?.name).toBe("Stérilisation de la chatte");
    expect(
      await domainError(service.applyProtocol(leo, plume, randomUUID())),
    ).toBe("invalid_target");
    const { rows } = await admin.query(
      "SELECT id FROM protocols WHERE organization_id = $1 AND library_key = 'sterilisation-chienne'",
      [org],
    );
    const forDogs = (rows[0] as { id: string } | undefined)?.id ?? "";
    expect(await domainError(service.applyProtocol(leo, plume, forDogs))).toBe(
      "invalid_target",
    );
  });

  it("refuse un contrôle avant l'intervention et un responsable qui n'est pas vétérinaire", async () => {
    const leo = await actor(ids.vet);
    const input = await sheetInputOf(leo, plume);
    expect(
      await domainError(
        service.save(
          leo,
          plume,
          {
            ...input,
            controlAppointmentAt: new Date(NOW.getTime() - 5 * HOUR),
          },
          { launch: false },
          NOW,
        ),
      ),
    ).toBe("invalid_target");
    expect(
      await domainError(
        service.save(
          leo,
          plume,
          { ...input, responsibleMembershipId: ids.assistant },
          { launch: false },
          NOW,
        ),
      ),
    ).toBe("invalid_target");
  });
});

describe("lancement", () => {
  it("seul le vétérinaire responsable lance, avec le numéro WhatsApp du cabinet connecté", async () => {
    const lou = await actor(ids.admin);
    const leo = await actor(ids.vet);
    const input = await sheetInputOf(leo, plume, { firstContactHours: 4 });
    expect(
      await domainError(service.save(lou, plume, input, { launch: true }, NOW)),
    ).toBe("forbidden");
    expect(
      await domainError(service.save(leo, plume, input, { launch: true }, NOW)),
    ).toBe("integration_missing");
    // L'échec annule tout : la fiche n'a pas été enregistrée à moitié.
    expect((await service.sheet(leo, plume)).followup.status).toBe("draft");
    await settings.connect(lou, "whatsapp", "06 39 98 00 00");
  });

  it("pas de lancement sans l'accord pour WhatsApp recueilli au cabinet ; il est noté et journalisé", async () => {
    const leo = await actor(ids.vet);
    const input = await sheetInputOf(leo, plume, { firstContactHours: 4 });
    expect(
      await domainError(
        service.save(
          leo,
          plume,
          { ...input, whatsappOptIn: false },
          { launch: true },
          NOW,
        ),
      ),
    ).toBe("optin_missing");
    expect((await service.sheet(leo, plume)).followup.status).toBe("draft");
    // Noté par la fiche (date et auteur d'origine gardés) ; la case se retrouve cochée.
    await service.save(leo, plume, input, { launch: false }, NOW);
    expect((await service.sheet(leo, plume)).contacts[0]?.optedIn).toBe(true);
    const { rows } = await admin.query(
      `SELECT c.whatsapp_optin_by_membership_id AS by, e.metadata
       FROM followup_contacts c, audit_events e
       WHERE c.followup_id = $1 AND e.target_id = $1 AND e.action = 'followup.whatsapp_optin'
       ORDER BY e.occurred_at DESC LIMIT 1`,
      [plume],
    );
    expect(rows).toEqual([
      { by: expect.any(String), metadata: { given: true } },
    ]);
  });

  it("« Lancer le suivi » fige la version, compte l'usage et planifie le premier message", async () => {
    const leo = await actor(ids.vet);
    const before = await service.sheet(leo, plume);
    await service.save(
      leo,
      plume,
      await sheetInputOf(leo, plume, { firstContactHours: 4 }),
      { launch: true },
      NOW,
    );

    const sheet = await service.sheet(leo, plume);
    expect(sheet.followup.status).toBe("active");
    expect(sheet.followup.startedAt).toEqual(NOW);
    expect(sheet.followup.firstContactAt).toEqual(
      new Date(NOW.getTime() + 2 * HOUR),
    );
    expect(sheet.protocol?.versionId).toBe(before.protocol?.versionId);
    expect(sheet.rights.canLaunch).toBe(false);

    expect(await statusEvents(plume)).toEqual([
      { from_status: null, to_status: "draft", reason: null },
      { from_status: "draft", to_status: "active", reason: "launched" },
    ]);
    const usage = await admin.query(
      "SELECT kind, idempotency_key FROM usage_events WHERE followup_id = $1",
      [plume],
    );
    expect(usage.rows).toEqual([
      { kind: "launch", idempotency_key: `launch:${plume}` },
    ]);
    const jobs = await admin.query(
      "SELECT kind, status, run_at, payload FROM scheduled_jobs WHERE followup_id = $1 ORDER BY run_at",
      [plume],
    );
    const {
      rows: [planned],
    } = await admin.query(
      "SELECT control_appointment_at FROM followups WHERE id = $1",
      [plume],
    );
    const control = (planned as { control_appointment_at: Date })
      .control_appointment_at;
    // Premier message, puis fin du suivi automatisé à la date de contrôle (lot 15).
    // Les rappels attendent l'accord du propriétaire.
    expect(jobs.rows).toEqual([
      {
        kind: "followup.message",
        status: "pending",
        run_at: new Date(NOW.getTime() + 2 * HOUR),
        payload: { step: "intro" },
      },
      {
        kind: "followup.end",
        status: "pending",
        run_at: control,
        payload: { endAt: String(control.getTime()) },
      },
    ]);
    const outbox = await admin.query(
      "SELECT topic FROM outbox_events WHERE aggregate_id = $1",
      [plume],
    );
    expect(outbox.rows).toEqual([{ topic: "followup.launched" }]);
    const launched = (await auditOf(plume)).find(
      (event) => event.action === "followup.launched",
    );
    expect(launched?.metadata).toMatchObject({
      firstContactHours: 4,
      test: false,
    });

    // Version figée : la base refuse de la changer.
    const code = await errorCode(
      asApp(app, org, (client) =>
        client.query(
          "UPDATE followups SET protocol_version_id = NULL WHERE id = $1",
          [plume],
        ),
      ),
    );
    expect(code).toBe("23514");
    expect(
      await domainError(
        service.save(
          leo,
          plume,
          await sheetInputOf(leo, plume),
          { launch: true },
          NOW,
        ),
      ),
    ).toBe("invalid_transition");
  });

  it("modifier un suivi en cours remplace les étapes à venir, jamais les passées", async () => {
    const leo = await actor(ids.vet);
    const later = new Date(NOW.getTime() + 30 * HOUR);
    const sheet = await service.sheet(leo, plume);
    // 32 h après l'intervention : les étapes à 4 h et 24 h sont passées.
    const { rows: before } = await admin.query(
      "SELECT offset_hours FROM followup_steps WHERE followup_id = $1 AND superseded_at IS NULL ORDER BY offset_hours",
      [plume],
    );
    const past = (before as { offset_hours: number }[]).filter(
      (row) => row.offset_hours <= 32,
    );
    expect(past.length).toBeGreaterThan(0);

    const future = [
      {
        offsetHours: 72,
        kind: "question" as const,
        content: "Comment va la cicatrice ?",
      },
    ];
    const input = {
      ...(await sheetInputOf(leo, plume)),
      firstContactHours: undefined,
      steps: future,
    };
    expect(
      await domainError(
        service.save(
          leo,
          plume,
          {
            ...input,
            steps: [{ offsetHours: 4, kind: "message", content: "Trop tard" }],
          },
          { launch: false },
          later,
        ),
      ),
    ).toBe("past_step");
    await service.save(leo, plume, input, { launch: false }, later);

    const { rows: after } = await admin.query(
      "SELECT offset_hours, content FROM followup_steps WHERE followup_id = $1 AND superseded_at IS NULL ORDER BY offset_hours",
      [plume],
    );
    expect(after).toHaveLength(past.length + 1);
    expect(
      (after as { offset_hours: number }[])
        .map((row) => row.offset_hours)
        .slice(0, past.length),
    ).toEqual(past.map((row) => row.offset_hours));
    expect(after.at(-1)).toEqual({
      offset_hours: 72,
      content: "Comment va la cicatrice ?",
    });
    expect(sheet.followup.planRevision).toBeGreaterThan(0);

    // Une ligne remplacée ne revient jamais.
    const code = await errorCode(
      asApp(app, org, (client) =>
        client.query(
          "UPDATE followup_steps SET superseded_at = NULL WHERE followup_id = $1 AND superseded_at IS NOT NULL",
          [plume],
        ),
      ),
    );
    expect(code).toBe("23514");
    const plan = (await auditOf(plume)).filter(
      (event) => event.action === "followup.plan_updated",
    );
    expect(plan.at(-1)?.metadata).toMatchObject({
      status: "active",
      steps: past.length + 1,
    });
  });
});

describe("pause, reprise, arrêt et réactivation", () => {
  it("chaque décision change l'état, garde un motif et laisse une trace", async () => {
    const leo = await actor(ids.vet);
    const lina = await actor(ids.assistant);
    expect(
      await domainError(service.changeStatus(lina, plume, "pause", NOW)),
    ).toBe("forbidden");
    expect(
      await domainError(service.changeStatus(leo, plume, "resume", NOW)),
    ).toBe("invalid_transition");

    await service.changeStatus(leo, plume, "pause", NOW);
    await service.changeStatus(leo, plume, "resume", NOW);
    await service.changeStatus(leo, plume, "stop", NOW);
    expect(
      await domainError(service.changeStatus(leo, plume, "pause", NOW)),
    ).toBe("invalid_transition");

    // Premier message replanifié à la reprise (jamais parti), puis tout annulé à l'arrêt.
    const { rows: jobs } = await admin.query(
      "SELECT status, payload FROM scheduled_jobs WHERE followup_id = $1 AND kind = 'followup.message'",
      [plume],
    );
    expect(jobs).toEqual([
      { status: "cancelled", payload: { step: "intro" } },
      { status: "cancelled", payload: { step: "intro" } },
    ]);

    await service.changeStatus(leo, plume, "reactivate", NOW);
    const { rows: pending } = await admin.query(
      "SELECT kind, payload FROM scheduled_jobs WHERE followup_id = $1 AND status = 'pending' ORDER BY run_at",
      [plume],
    );
    // La fin du suivi automatisé est annulée à l'arrêt, replanifiée à la réactivation.
    expect(pending).toEqual([
      { kind: "followup.message", payload: { step: "intro" } },
      { kind: "followup.end", payload: expect.any(Object) },
    ]);
    expect((await service.sheet(leo, plume)).followup.status).toBe("active");
    expect((await statusEvents(plume)).slice(2)).toEqual([
      { from_status: "active", to_status: "paused", reason: "vet_paused" },
      { from_status: "paused", to_status: "active", reason: "vet_resumed" },
      { from_status: "active", to_status: "ended", reason: "vet_stopped" },
      { from_status: "ended", to_status: "active", reason: "vet_reactivated" },
    ]);
    const { rows: usage } = await admin.query(
      "SELECT kind FROM usage_events WHERE followup_id = $1 ORDER BY occurred_at, kind",
      [plume],
    );
    expect(usage).toEqual([{ kind: "launch" }, { kind: "reactivation" }]);
    const actions = (await auditOf(plume)).map((event) => event.action);
    for (const action of [
      "followup.paused",
      "followup.resumed",
      "followup.stopped",
      "followup.reactivated",
    ])
      expect(actions).toContain(action);
  });

  it("la base refuse un cycle de vie incohérent", async () => {
    const back = await errorCode(
      asApp(app, org, (client) =>
        client.query("UPDATE followups SET status = 'draft' WHERE id = $1", [
          plume,
        ]),
      ),
    );
    expect(back).toBe("23514");

    // Brouillon lancé sans premier message : refusé.
    const leo = await actor(ids.vet);
    const gaston = await service.prepare(leo, "DV-20517");
    const incomplete = await errorCode(
      asApp(app, org, (client) =>
        client.query(
          "UPDATE followups SET status = 'active', started_at = now(), first_contact_at = NULL WHERE id = $1",
          [gaston],
        ),
      ),
    );
    expect(incomplete).toBe("23514");
  });
});

describe("isolation", () => {
  it("un autre cabinet ne voit ni la fiche ni l'import", async () => {
    const olga = await actor(ids.outsider, other);
    expect(await domainError(service.sheet(olga, plume))).toBe("not_found");
    expect(
      await domainError(service.changeStatus(olga, plume, "pause", NOW)),
    ).toBe("not_found");
    const rows = await asApp(app, other, async (client) => {
      const imports = await client.query(
        "SELECT 1 FROM followup_imports WHERE followup_id = $1",
        [plume],
      );
      const steps = await client.query(
        "SELECT 1 FROM followup_steps WHERE followup_id = $1",
        [plume],
      );
      return imports.rows.length + steps.rows.length;
    });
    expect(rows).toBe(0);
  });
});
