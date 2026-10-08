import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createOrganization } from "../../db/seed/cabinets-fictifs";
import { fakeAiGateway, simulatedNumaStep } from "@/adapters/ai-gateway/fake";
import { createFakeDrVeto } from "@/adapters/drveto/fake";
import { fakePaymentMandate } from "@/adapters/payments/fake";
import { fakeWhatsApp } from "@/adapters/whatsapp/fake";
import type { WhatsAppConnector } from "@/adapters/whatsapp/types";
import {
  conversationHandlers,
  conversationsService,
} from "@/domains/conversations/service";
import type { Actor } from "@/domains/equipe/actor";
import { isPermissionKey } from "@/domains/equipe/permissions";
import { protocolsService } from "@/domains/protocoles/service";
import { settingsService } from "@/domains/reglages/service";
import { launchService } from "@/domains/suivis/lancement";
import { stepDueAt } from "@/domains/suivis/plan";
import { automaticEndAt, stepsToSchedule } from "@/domains/suivis/programme";
import {
  followupEndHandlers,
  messageWindows,
  scheduleReminders,
} from "@/domains/suivis/rappels";
import type { JobHandler } from "@/domains/taches/worker";
import { createWorker } from "@/domains/taches/worker";
import { alertHandlers } from "@/domains/urgences/service";
import { withTenant } from "@/server/db/tenant";

import { pools } from "./support/db";

/**
 * Lot 15 : rappels planifiés et fin du suivi automatisé (ADR 0018). Les heures d'envoi sont
 * comparées au calcul pur (plage du cabinet, heure de Paris) ; le changement d'heure est
 * couvert par les tests unitaires de `programme.ts`.
 */

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

const HOUR = 3_600_000;
const PRACTICE = "Clinique d'essai des rappels";
const drveto = createFakeDrVeto();
const launches = launchService({ db: appDb, drveto });
const conversations = conversationsService(appDb);
const settings = settingsService({
  db: appDb,
  whatsapp: fakeWhatsApp,
  drveto,
  payments: fakePaymentMandate,
});
const protocols = protocolsService(appDb);

type Sent = { to: string; body: string; idempotencyKey: string };
const sent: Sent[] = [];
const whatsapp: WhatsAppConnector = {
  simulated: true,
  connectBusinessNumber: fakeWhatsApp.connectBusinessNumber,
  sendStaffAlert: fakeWhatsApp.sendStaffAlert,
  async sendMessage(input) {
    sent.push(input);
    return fakeWhatsApp.sendMessage(input);
  },
};

const org = randomUUID();
const tag = org.slice(0, 8);
let ids: { admin: string; vet: string };

const allHandlers: Record<string, JobHandler> = {
  ...conversationHandlers({ whatsapp, ai: fakeAiGateway }),
  ...alertHandlers({ whatsapp }),
  ...followupEndHandlers(),
};
const worker = createWorker({
  db: appDb,
  workerId: "test-rappels",
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

/** Prépare et lance un suivi par Dr Léo Vet (premier message 2 h plus tard). */
async function launch(ref: string): Promise<string> {
  const leo = await actor(ids.vet);
  const id = await launches.prepare(leo, ref);
  let sheet = await launches.sheet(leo, id);
  if (!sheet.protocol) {
    const option = sheet.protocolOptions[0];
    if (!option) throw new Error("aucun protocole");
    await launches.applyProtocol(leo, id, option.protocolId);
    sheet = await launches.sheet(leo, id);
  }
  const hoursSince = Math.ceil(
    (Date.now() - sheet.followup.procedureAt.getTime()) / HOUR,
  );
  await launches.save(
    leo,
    id,
    {
      firstContactHours: hoursSince + 2,
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
  return id;
}

/** Simulateur : avance jusqu'au prochain envoi prévu de ce suivi, puis passage du worker. */
async function advance(followupId: string) {
  await conversations.makeDueNow(await actor(ids.vet), followupId);
  await drain();
}

async function consent(followupId: string) {
  await advance(followupId);
  await conversations.receiveOwnerMessage(org, followupId, "OUI");
  await drain();
}

type JobRow = {
  id: string;
  kind: string;
  status: string;
  run_at: Date;
  payload: Record<string, string>;
};

async function jobsOf(followupId: string, kind: string): Promise<JobRow[]> {
  const { rows } = await admin.query(
    `SELECT id, kind, status, run_at, payload FROM scheduled_jobs
     WHERE followup_id = $1 AND kind = $2 ORDER BY run_at, created_at`,
    [followupId, kind],
  );
  return rows as JobRow[];
}

async function currentSteps(followupId: string) {
  const { rows } = await admin.query(
    `SELECT id, offset_hours, kind, content FROM followup_steps
     WHERE followup_id = $1 AND superseded_at IS NULL ORDER BY offset_hours`,
    [followupId],
  );
  return (
    rows as {
      id: string;
      offset_hours: number;
      kind: "message" | "question" | "photo_request" | "reminder" | "control";
      content: string;
    }[]
  ).map((row) => ({
    id: row.id,
    offsetHours: row.offset_hours,
    kind: row.kind,
    content: row.content,
  }));
}

async function followupRow(followupId: string) {
  const { rows } = await admin.query(
    `SELECT f.status, f.procedure_at, f.control_appointment_at,
       (SELECT reason FROM followup_status_events e WHERE e.followup_id = f.id
        ORDER BY occurred_at DESC LIMIT 1) AS reason
     FROM followups f WHERE f.id = $1`,
    [followupId],
  );
  return rows[0] as {
    status: string;
    procedure_at: Date;
    control_appointment_at: Date | null;
    reason: string | null;
  };
}

async function messagesOf(followupId: string) {
  const { rows } = await admin.query(
    `SELECT author, body, idempotency_key FROM messages
     WHERE followup_id = $1 ORDER BY occurred_at, id`,
    [followupId],
  );
  return rows as {
    author: string;
    body: string;
    idempotency_key: string | null;
  }[];
}

beforeAll(async () => {
  const [adminId, vet] = await createOrganization(appDb, org, PRACTICE, [
    {
      email: `ra-${tag}@essai.test`,
      displayName: "Dr Lou Admin",
      role: "admin_vet",
    },
    { email: `rv-${tag}@essai.test`, displayName: "Dr Léo Vet", role: "vet" },
  ]);
  if (!adminId || !vet) throw new Error("cabinet");
  ids = { admin: adminId, vet };
  const lou = await actor(adminId);
  await settings.connect(lou, "drveto", "ESSAI-04");
  await settings.connect(lou, "whatsapp", "06 39 98 00 03");
  for (const key of ["sterilisation-chatte", "sterilisation-chienne"]) {
    const id = await protocols.installFromLibrary(lou, key);
    await protocols.validate(lou, id);
  }
});

let plume: string;

describe("rappels planifiés", () => {
  it("aucun rappel avant l'accord ; après OUI, une tâche par étape à venir, dans la plage du cabinet", async () => {
    plume = await launch("DV-20481");
    await advance(plume);
    expect(await jobsOf(plume, "followup.reminder")).toEqual([]);

    const before = Date.now();
    await conversations.receiveOwnerMessage(org, plume, "OUI");
    const after = Date.now();
    const jobs = await jobsOf(plume, "followup.reminder");
    const steps = await currentSteps(plume);
    const row = await followupRow(plume);
    const expected = await withTenant(
      appDb,
      { organizationId: org },
      async (tx) =>
        stepsToSchedule({
          steps,
          procedureAt: row.procedure_at,
          endAt: automaticEndAt({
            procedureAt: row.procedure_at,
            controlAppointmentAt: row.control_appointment_at,
            stepOffsets: steps.map((step) => step.offsetHours),
          }),
          windows: await messageWindows(tx),
          now: new Date((before + after) / 2),
        }),
    );
    expect(expected.length).toBeGreaterThan(2);
    expect(
      jobs.map((job) => [job.payload.stepId, job.run_at.toISOString()]),
    ).toEqual(
      expected.map(({ step, runAt }) => [step.id, runAt.toISOString()]),
    );
    // Aucun rappel au-delà de la date de contrôle.
    for (const job of jobs)
      expect(job.run_at.getTime()).toBeLessThan(
        row.control_appointment_at?.getTime() ?? 0,
      );

    // Replanifier ne crée aucun doublon.
    await withTenant(appDb, { organizationId: org }, (tx) =>
      scheduleReminders(tx, plume, new Date()),
    );
    expect(await jobsOf(plume, "followup.reminder")).toHaveLength(jobs.length);
  });

  it("un rappel part à son heure, rédigé par Numa d'après la consigne, une seule fois", async () => {
    await drain();
    const [first] = await jobsOf(plume, "followup.reminder");
    if (!first) throw new Error("aucun rappel");
    expect(first.status).toBe("pending");
    const before = sent.length;
    await advance(plume);
    expect(sent).toHaveLength(before + 1);
    const step = (await currentSteps(plume)).find(
      (candidate) => candidate.id === first.payload.stepId,
    );
    if (!step) throw new Error("étape");
    const message = (await messagesOf(plume)).at(-1);
    expect(message).toMatchObject({
      author: "numa",
      idempotency_key: `step:${step.id}`,
      body: simulatedNumaStep({
        language: "fr",
        animalName: "Plume",
        practiceName: PRACTICE,
        kind: step.kind,
        instruction: step.content,
        controlAppointmentAt: (await followupRow(plume)).control_appointment_at,
      }).text,
    });

    // Rejouée, l'étape ne repart pas.
    await withTenant(appDb, { organizationId: org }, async (tx) => {
      const handler = allHandlers["followup.reminder"];
      if (!handler) throw new Error("exécutant manquant");
      await handler({
        tx,
        job: {
          id: randomUUID(),
          organizationId: org,
          kind: "followup.reminder",
          attempt: 1,
          followupId: plume,
          payload: { stepId: step.id },
          idempotencyKey: `followup:${plume}:step:${step.id}`,
        },
      });
    });
    expect(sent).toHaveLength(before + 1);
  });

  it("en pause, le rappel ne part pas, et ne repart pas à la reprise", async () => {
    const leo = await actor(ids.vet);
    await launches.changeStatus(leo, plume, "pause");
    const next = (await jobsOf(plume, "followup.reminder")).find(
      (job) => job.status === "pending",
    );
    if (!next) throw new Error("aucun rappel à venir");
    const before = sent.length;
    await advance(plume);
    expect(sent).toHaveLength(before);
    await launches.changeStatus(leo, plume, "resume");
    const jobs = await jobsOf(plume, "followup.reminder");
    expect(
      jobs.filter((job) => job.payload.stepId === next.payload.stepId),
    ).toEqual([expect.objectContaining({ status: "succeeded" })]);
    expect(
      (await messagesOf(plume)).some(
        (message) => message.idempotency_key === `step:${next.payload.stepId}`,
      ),
    ).toBe(false);
    expect(jobs.filter((job) => job.status === "pending").length).toBe(
      jobs.length - 2,
    );
  });

  it("modifier le suivi remplace les rappels à venir, jamais ceux déjà partis", async () => {
    const leo = await actor(ids.vet);
    const sentBefore = await messagesOf(plume);
    const sheet = await launches.sheet(leo, plume);
    const procedureAt = sheet.followup.procedureAt;
    const hoursSince = Math.ceil((Date.now() - procedureAt.getTime()) / HOUR);
    const newControl = new Date(procedureAt.getTime() + 200 * HOUR);
    await launches.save(
      leo,
      plume,
      {
        controlAppointmentAt: newControl,
        steps: [
          {
            offsetHours: hoursSince + 30,
            kind: "question",
            content: "La cicatrice est-elle sèche et propre ?",
          },
        ],
        alerts: sheet.alerts,
        validateTreatmentIds: [],
        removeTreatmentIds: [],
        addTreatments: [],
      },
      { launch: false },
    );
    const steps = await currentSteps(plume);
    const added = steps.find((step) => step.offsetHours === hoursSince + 30);
    if (!added) throw new Error("étape ajoutée");
    const jobs = await jobsOf(plume, "followup.reminder");
    // Seule la nouvelle étape attend ; les rappels des étapes remplacées sont annulés.
    expect(
      jobs
        .filter((job) => job.status === "pending")
        .map((job) => job.payload.stepId),
    ).toEqual([added.id]);
    expect(
      jobs.filter((job) => job.status === "cancelled").length,
    ).toBeGreaterThan(0);
    const [pending] = jobs.filter((job) => job.status === "pending");
    expect(pending?.run_at.getTime()).toBeGreaterThanOrEqual(
      stepDueAt(procedureAt, hoursSince + 30).getTime(),
    );
    // Les messages déjà partis restent tels quels.
    expect((await messagesOf(plume)).slice(0, sentBefore.length)).toEqual(
      sentBefore,
    );

    // La fin du suivi suit la nouvelle date de contrôle ; l'ancienne tâche est annulée.
    const ends = await jobsOf(plume, "followup.end");
    expect(ends.filter((job) => job.status === "pending")).toEqual([
      expect.objectContaining({
        run_at: newControl,
        payload: { endAt: String(newControl.getTime()) },
      }),
    ]);
    const stale = ends.find((job) => job.status === "cancelled");
    if (!stale) throw new Error("ancienne fin");
    // Une tâche de fin périmée ne termine rien.
    await withTenant(appDb, { organizationId: org }, async (tx) => {
      const handler = allHandlers["followup.end"];
      if (!handler) throw new Error("exécutant manquant");
      await handler({
        tx,
        job: {
          id: randomUUID(),
          organizationId: org,
          kind: "followup.end",
          attempt: 1,
          followupId: plume,
          payload: stale.payload,
          idempotencyKey: `followup:${plume}:end:stale`,
        },
      });
    });
    expect((await followupRow(plume)).status).toBe("active");
  });
});

describe("fin du suivi automatisé", () => {
  it("à la date de contrôle : suivi terminé, rappels annulés, message de clôture", async () => {
    const [end] = (await jobsOf(plume, "followup.end")).filter(
      (job) => job.status === "pending",
    );
    if (!end) throw new Error("fin non planifiée");
    // Le temps passe jusqu'à la date de contrôle.
    await admin.query(
      "UPDATE scheduled_jobs SET run_at = now() WHERE id = $1",
      [end.id],
    );
    await drain();
    expect(await followupRow(plume)).toMatchObject({
      status: "ended",
      reason: "control_date_reached",
    });
    expect(
      (await jobsOf(plume, "followup.reminder")).filter(
        (job) => job.status === "pending",
      ),
    ).toEqual([]);
    const closing = (await messagesOf(plume)).at(-1);
    expect(closing?.author).toBe("numa");
    expect(closing?.body).toContain("se termine aujourd'hui");
    expect(closing?.body).toContain("Cette conversation reste ouverte");
    const { rows } = await admin.query(
      "SELECT actor_membership_id, metadata FROM audit_events WHERE target_id = $1 AND action = 'followup.ended_automatically'",
      [plume],
    );
    expect(rows).toEqual([
      { actor_membership_id: null, metadata: { from: "active" } },
    ]);
  });

  it("le propriétaire réécrit : Numa répond et le vétérinaire est informé, une fois", async () => {
    const before = sent.length;
    const received = await conversations.receiveOwnerMessage(
      org,
      plume,
      "Bonjour, elle a bien récupéré",
    );
    expect(received).toMatchObject({ outcome: "reply", triage: "watch" });
    await drain();
    expect(sent).toHaveLength(before + 1);
    expect((await messagesOf(plume)).at(-1)?.author).toBe("numa");
    const { rows: alerts } = await admin.query(
      `SELECT a.level, a.status, a.target_membership_id, t.reason FROM alerts a
       JOIN triage_events t ON t.id = a.triage_event_id WHERE a.followup_id = $1`,
      [plume],
    );
    expect(alerts).toEqual([
      {
        level: "watch",
        status: "open",
        target_membership_id: ids.vet,
        reason: "Le propriétaire a réécrit après la fin du suivi automatisé.",
      },
    ]);
    const { rows: deliveries } = await admin.query(
      `SELECT d.channel, d.status FROM notification_deliveries d
       JOIN alerts a ON a.id = d.alert_id WHERE a.followup_id = $1`,
      [plume],
    );
    expect(deliveries).toEqual([{ channel: "desktop", status: "sent" }]);

    // Tant que l'information est ouverte, un nouveau message n'en crée pas d'autre.
    expect(
      await conversations.receiveOwnerMessage(org, plume, "Merci encore"),
    ).toMatchObject({ outcome: "reply", triage: "normal" });
    await drain();
    expect(sent).toHaveLength(before + 2);
    expect(
      (
        await admin.query(
          "SELECT count(*)::int AS n FROM alerts WHERE followup_id = $1",
          [plume],
        )
      ).rows[0],
    ).toEqual({ n: 1 });
  });

  it("après un arrêt par le vétérinaire, Numa ne répond plus", async () => {
    const tango = await launch("DV-20560");
    await consent(tango);
    await launches.changeStatus(await actor(ids.vet), tango, "stop");
    const before = sent.length;
    expect(
      await conversations.receiveOwnerMessage(org, tango, "Hello, all good"),
    ).toMatchObject({ outcome: "stored", triage: "normal" });
    await drain();
    expect(sent).toHaveLength(before);
    expect(await jobsOf(tango, "followup.reminder")).not.toContainEqual(
      expect.objectContaining({ status: "pending" }),
    );
  });
});
