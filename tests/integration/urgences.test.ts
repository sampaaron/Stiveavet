import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createOrganization } from "../../db/seed/cabinets-fictifs";
import { fakeAiGateway } from "@/adapters/ai-gateway/fake";
import { createFakeDrVeto } from "@/adapters/drveto/fake";
import { fakePaymentMandate } from "@/adapters/payments/fake";
import { conversationsService } from "@/domains/conversations/service";
import { DomainError } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import { isPermissionKey } from "@/domains/equipe/permissions";
import { protocolsService } from "@/domains/protocoles/service";
import { DEFAULT_INSTRUCTIONS } from "@/domains/reglages/content";
import { settingsService } from "@/domains/reglages/service";
import { launchService } from "@/domains/suivis/lancement";
import {
  alertHandlers,
  alertsService,
  triageOwnerMessage,
} from "@/domains/urgences/service";
import { withTenant } from "@/server/db/tenant";

import { pools } from "./support/db";
import { conversationWorker, recordingWhatsApp } from "./support/whatsapp";

/**
 * Lot 14 : triage, alertes et garde (ADR 0017). Tests horodatés : l'escalade part à l'heure
 * réglée et jamais avant ; les consignes au propriétaire n'attendent jamais l'escalade.
 */

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

const MINUTE = 60_000;
const drveto = createFakeDrVeto();
const launches = launchService({ db: appDb, drveto });
const conversations = conversationsService(appDb);
const alertsApi = alertsService(appDb);
const settings = settingsService({
  db: appDb,
  whatsapp: { live: false },
  drveto,
  payments: fakePaymentMandate,
});
const protocols = protocolsService(appDb);

/** WhatsApp simulé qui garde les messages au propriétaire et les alertes à l'équipe. */
const whatsapp = recordingWhatsApp();
const { sent } = whatsapp;
/** Numéro d'alerte de chaque vétérinaire (réglé dans « Alertes »), vers son identifiant. */
const alertPhones = new Map<string, string>();
const isStaff = (entry: (typeof sent)[number]) =>
  entry.template === "alerte_urgente" || entry.template === "alerte_escalade";
const staffAlerts = () =>
  sent.filter(isStaff).map((entry) => ({
    membershipId: alertPhones.get(entry.to),
    kind: entry.template === "alerte_urgente" ? "urgent" : "escalation",
    at: entry.at,
  }));
const ownerSent = () => sent.filter((entry) => !isStaff(entry));

const org = randomUUID();
const other = randomUUID();
const tag = org.slice(0, 8);
let ids: {
  admin: string;
  vet: string;
  vet2: string;
  assistant: string;
  outsider: string;
};

// Base partagée : seules les tâches de ce cabinet sont exécutées ici.
const { worker } = conversationWorker({
  db: appDb,
  workerId: "test-urgences",
  organizationId: () => org,
  whatsapp,
  ai: fakeAiGateway,
});

async function drain() {
  for (let pass = 0; pass < 5; pass += 1) await worker.runOnce();
}

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

/** Lance un suivi par Dr Léo Vet, puis le propriétaire donne son accord. */
async function launchWithConsent(ref: string): Promise<string> {
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
    (Date.now() - sheet.followup.procedureAt.getTime()) / 3_600_000,
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
      whatsappOptIn: true,
    },
    { launch: true },
  );
  await conversations.makeDueNow(leo, id);
  await drain();
  await conversations.receiveOwnerMessage(org, id, "OUI");
  await drain();
  return id;
}

type AlertRow = {
  id: string;
  level: string;
  status: string;
  target_membership_id: string;
  created_at: Date;
  escalate_at: Date | null;
  escalated_at: Date | null;
};

async function alertsOf(followupId: string): Promise<AlertRow[]> {
  const { rows } = await admin.query(
    `SELECT id, level, status, target_membership_id, created_at, escalate_at, escalated_at
     FROM alerts WHERE followup_id = $1 ORDER BY created_at, id`,
    [followupId],
  );
  return rows as AlertRow[];
}

/** Alerte ouverte par un message du propriétaire (première évaluation). */
async function alertOfMessage(messageId: string): Promise<AlertRow> {
  const { rows } = await admin.query(
    `SELECT a.id, a.level, a.status, a.target_membership_id, a.created_at, a.escalate_at, a.escalated_at
     FROM alerts a JOIN triage_events t ON t.id = a.triage_event_id
     WHERE t.message_id = $1 ORDER BY t.created_at LIMIT 1`,
    [messageId],
  );
  const row = rows[0] as AlertRow | undefined;
  if (!row) throw new Error("aucune alerte pour ce message");
  return row;
}

async function alertById(id: string): Promise<AlertRow> {
  const { rows } = await admin.query(
    `SELECT id, level, status, target_membership_id, created_at, escalate_at, escalated_at
     FROM alerts WHERE id = $1`,
    [id],
  );
  const row = rows[0] as AlertRow | undefined;
  if (!row) throw new Error("alerte inconnue");
  return row;
}

async function jobsOf(alertId: string) {
  const { rows } = await admin.query(
    `SELECT kind, status, run_at FROM scheduled_jobs
     WHERE payload->>'alertId' = $1 ORDER BY created_at, run_at`,
    [alertId],
  );
  return rows as { kind: string; status: string; run_at: Date }[];
}

/** Exécute l'escalade d'une alerte comme le worker, avec une horloge choisie. */
async function escalateAt(alertId: string, clock: Date) {
  const handler = alertHandlers({
    whatsapp: whatsapp.provider,
    clock: () => clock,
  }).handlers["alert.escalate"];
  if (!handler) throw new Error("exécutant manquant");
  await withTenant(appDb, { organizationId: org }, (tx) =>
    handler({
      tx,
      job: {
        id: randomUUID(),
        organizationId: org,
        kind: "alert.escalate",
        attempt: 1,
        followupId: null,
        payload: { alertId },
        idempotencyKey: `alert:${alertId}:escalate`,
      },
    }),
  );
  // Chaque alerte part par sa propre tâche d'envoi.
  await drain();
}

/** Évalue à nouveau un message du propriétaire, à une heure choisie. */
async function triageAt(followupId: string, messageId: string, now: Date) {
  return withTenant(appDb, { organizationId: org }, (tx) =>
    triageOwnerMessage(
      tx,
      {
        organizationId: org,
        followupId,
        responsibleMembershipId: ids.vet,
        messageId,
        body: "Les points sont lâchés",
      },
      now,
    ),
  );
}

beforeAll(async () => {
  const [adminId, vet, vet2, assistant] = await createOrganization(
    appDb,
    org,
    "Clinique d'essai des urgences",
    [
      {
        email: `ua-${tag}@essai.test`,
        displayName: "Dr Lou Admin",
        role: "admin_vet",
      },
      { email: `uv-${tag}@essai.test`, displayName: "Dr Léo Vet", role: "vet" },
      { email: `uz-${tag}@essai.test`, displayName: "Dr Zoé Vet", role: "vet" },
      {
        email: `us-${tag}@essai.test`,
        displayName: "Lina Asv",
        role: "assistant",
      },
    ],
  );
  const [outsider] = await createOrganization(appDb, other, "Autre cabinet", [
    {
      email: `uo-${tag}@essai.test`,
      displayName: "Dr Olga Autre",
      role: "admin_vet",
    },
  ]);
  if (!adminId || !vet || !vet2 || !assistant || !outsider)
    throw new Error("cabinet");
  ids = { admin: adminId, vet, vet2, assistant, outsider };
  const lou = await actor(adminId);
  await settings.connect(lou, "drveto", "ESSAI-03");
  await settings.connect(lou, "whatsapp", "06 39 98 00 02");
  for (const [membershipId, phone] of [
    [adminId, "+33639981001"],
    [vet, "+33639981002"],
    [vet2, "+33639981003"],
  ] as const) {
    await alertsApi.setAlertPhone(await actor(membershipId), phone);
    alertPhones.set(phone, membershipId);
  }
  for (const key of ["sterilisation-chatte", "sterilisation-chienne"]) {
    const id = await protocols.installFromLibrary(lou, key);
    await protocols.validate(lou, id);
  }
});

let plume: string;
let urgentMessage: string;
let firstAlert: AlertRow;

describe("urgence : consignes tout de suite, escalade à l'heure réglée", () => {
  it("un message urgent : consignes au propriétaire et alerte au responsable dans le même passage", async () => {
    plume = await launchWithConsent("DV-20481");
    const ownerMessagesBefore = ownerSent().length;
    const received = await conversations.receiveOwnerMessage(
      org,
      plume,
      "Les points sont lâchés, on voit la plaie",
    );
    expect(received).toMatchObject({ outcome: "urgent", triage: "urgent" });
    urgentMessage = received.messageId;

    const [alert] = await alertsOf(plume);
    if (!alert) throw new Error("aucune alerte");
    firstAlert = alert;
    expect(alert).toMatchObject({
      level: "urgent",
      status: "open",
      target_membership_id: ids.vet,
      escalated_at: null,
    });
    // Délai réglé par défaut : 4 h, à la milliseconde près.
    expect(alert.escalate_at?.getTime()).toBe(
      alert.created_at.getTime() + 240 * MINUTE,
    );
    const jobs = await jobsOf(alert.id);
    expect(jobs.map((job) => [job.kind, job.status])).toEqual([
      ["alert.notify", "pending"],
      ["alert.escalate", "pending"],
    ]);
    expect(jobs[1]?.run_at.getTime()).toBe(alert.escalate_at?.getTime());

    await drain();
    // Les consignes partent au propriétaire, sans attendre l'escalade.
    const toOwner = ownerSent().slice(ownerMessagesBefore);
    const instructions = toOwner.find((message) =>
      message.body.includes("Consignes du cabinet"),
    );
    expect(instructions).toBeDefined();
    expect(
      Object.values(DEFAULT_INSTRUCTIONS).some((text) =>
        instructions?.body.includes(text),
      ),
    ).toBe(true);
    expect(instructions?.body).toContain("Plume");
    expect(instructions?.at.getTime()).toBeLessThan(
      alert.escalate_at?.getTime() ?? 0,
    );
    // Numa poursuit ensuite la discussion (elle a la main et l'accord).
    expect(toOwner.at(-1)?.body).not.toContain("Consignes du cabinet");
    // Le responsable est alerté par WhatsApp ; personne d'autre.
    expect(staffAlerts()).toEqual([
      expect.objectContaining({ membershipId: ids.vet, kind: "urgent" }),
    ]);
    expect((await alertById(alert.id)).status).toBe("open");
  });

  it("rien ne part avant l'heure : la tâche attend, et une exécution trop tôt se replanifie", async () => {
    await drain();
    expect((await alertById(firstAlert.id)).status).toBe("open");
    expect(
      staffAlerts().filter((entry) => entry.kind === "escalation"),
    ).toEqual([]);

    const due = firstAlert.escalate_at;
    if (!due) throw new Error("escalade non prévue");
    await escalateAt(firstAlert.id, new Date(due.getTime() - 1000));
    expect((await alertById(firstAlert.id)).status).toBe("open");
    const pending = (await jobsOf(firstAlert.id)).filter(
      (job) => job.kind === "alert.escalate" && job.status === "pending",
    );
    expect(pending.length).toBe(2);
    for (const job of pending) expect(job.run_at.getTime()).toBe(due.getTime());

    // À l'heure exacte : toute l'équipe vétérinaire est alertée, sauf l'assistante.
    await escalateAt(firstAlert.id, due);
    const escalated = await alertById(firstAlert.id);
    expect(escalated.status).toBe("escalated");
    expect(escalated.escalated_at?.getTime()).toBe(due.getTime());
    const escalations = staffAlerts().filter(
      (entry) => entry.kind === "escalation",
    );
    expect(escalations.map((entry) => entry.membershipId).sort()).toEqual(
      [ids.admin, ids.vet2].sort(),
    );
    // Rejouée, l'escalade ne renvoie rien.
    await escalateAt(firstAlert.id, new Date(due.getTime() + MINUTE));
    expect(
      staffAlerts().filter((entry) => entry.kind === "escalation"),
    ).toHaveLength(2);
  });

  it("en temps réel : à 3 h 59 rien ne part, à 4 h 01 le worker escalade", async () => {
    const now = Date.now();
    const early = await triageAt(
      plume,
      urgentMessage,
      new Date(now - 239 * MINUTE),
    );
    const late = await triageAt(
      plume,
      urgentMessage,
      new Date(now - 241 * MINUTE),
    );
    if (!early.alertId || !late.alertId) throw new Error("alertes");
    await drain();
    expect((await alertById(early.alertId)).status).toBe("open");
    const escalated = await alertById(late.alertId);
    expect(escalated.status).toBe("escalated");
    expect(escalated.escalated_at?.getTime()).toBeGreaterThanOrEqual(
      escalated.escalate_at?.getTime() ?? Infinity,
    );
  });

  it("accuser réception arrête l'escalade ; seul le motif est journalisé", async () => {
    const received = await conversations.receiveOwnerMessage(
      org,
      plume,
      "Elle a fait une convulsion",
    );
    expect(received.outcome).toBe("urgent");
    const alert = await alertOfMessage(received.messageId);
    if (!alert.escalate_at) throw new Error("alerte");
    await alertsApi.acknowledge(await actor(ids.vet), alert.id);
    expect((await alertById(alert.id)).status).toBe("acknowledged");
    expect(
      (await jobsOf(alert.id))
        .filter((job) => job.kind === "alert.escalate")
        .map((job) => job.status),
    ).toEqual(["cancelled"]);

    const before = staffAlerts().length;
    await escalateAt(alert.id, new Date(alert.escalate_at.getTime() + MINUTE));
    await drain();
    expect((await alertById(alert.id)).status).toBe("acknowledged");
    expect(
      staffAlerts()
        .slice(before)
        .filter((entry) => entry.kind === "escalation"),
    ).toEqual([]);
    expect(
      await domainError(alertsApi.acknowledge(await actor(ids.vet), alert.id)),
    ).toBe("invalid_transition");

    const [view] = (
      await alertsApi.ofFollowup(await actor(ids.vet), plume)
    ).filter((entry) => entry.id === alert.id);
    expect(view).toMatchObject({
      status: "acknowledged",
      acknowledgedBy: "Dr Léo Vet",
      canAcknowledge: true,
    });

    const { rows } = await admin.query(
      `SELECT action, metadata FROM audit_events
       WHERE organization_id = $1 AND action LIKE 'alert.%' ORDER BY occurred_at`,
      [org],
    );
    const actions = (rows as { action: string }[]).map((row) => row.action);
    for (const action of [
      "alert.raised",
      "alert.escalated",
      "alert.acknowledged",
    ])
      expect(actions).toContain(action);
    // Aucun texte du propriétaire ni motif clinique dans le journal.
    expect(JSON.stringify(rows)).not.toMatch(/points|convulsion|plaie/i);
  });

  it("clore toutes les alertes rend au suivi sa priorité normale", async () => {
    const leo = await actor(ids.vet);
    expect(
      (await admin.query("SELECT triage FROM followups WHERE id = $1", [plume]))
        .rows[0],
    ).toEqual({ triage: "urgent" });
    for (const alert of await alertsApi.ofFollowup(leo, plume))
      if (alert.status !== "resolved") await alertsApi.resolve(leo, alert.id);
    expect(
      (await alertsApi.ofFollowup(leo, plume)).every(
        (alert) => alert.status === "resolved",
      ),
    ).toBe(true);
    expect(await alertsApi.open(leo)).toEqual([]);
    expect(
      (await admin.query("SELECT triage FROM followups WHERE id = $1", [plume]))
        .rows[0],
    ).toEqual({ triage: "normal" });
  });
});

describe("à surveiller et garde", () => {
  it("à surveiller : notification sur l'ordinateur du responsable, sans WhatsApp ni escalade", async () => {
    const before = staffAlerts().length;
    const received = await conversations.receiveOwnerMessage(
      org,
      plume,
      "Elle a un peu vomi ce matin",
    );
    expect(received).toMatchObject({ outcome: "reply", triage: "watch" });
    const alert = await alertOfMessage(received.messageId);
    expect(alert).toMatchObject({
      level: "watch",
      status: "open",
      target_membership_id: ids.vet,
      escalate_at: null,
    });
    await drain();
    expect(staffAlerts().length).toBe(before);
    const { rows } = await admin.query(
      `SELECT channel, status, recipient_membership_id FROM notification_deliveries
       WHERE alert_id = $1`,
      [alert.id],
    );
    expect(rows).toEqual([
      { channel: "desktop", status: "sent", recipient_membership_id: ids.vet },
    ]);
    expect((await jobsOf(alert.id)).map((job) => job.kind)).toEqual([
      "alert.notify",
    ]);
    await alertsApi.resolve(await actor(ids.vet), alert.id);
  });

  it("le responsable aux heures du cabinet, la garde en dehors", async () => {
    // Garde de Dr Zoé Vet du samedi 10 octobre 2026, 20 h, au dimanche 10 h (Paris).
    await admin.query(
      `INSERT INTO on_call_schedules (organization_id, membership_id, starts_at, ends_at, created_by_membership_id)
       VALUES ($1, $2, '2026-10-10T18:00:00Z', '2026-10-11T08:00:00Z', $3)`,
      [org, ids.vet2, ids.admin],
    );
    const weekend = await triageAt(
      plume,
      urgentMessage,
      new Date("2026-10-10T20:00:00Z"),
    );
    const weekday = await triageAt(
      plume,
      urgentMessage,
      new Date("2026-10-07T12:00:00Z"),
    );
    if (!weekend.alertId || !weekday.alertId) throw new Error("alertes");
    expect((await alertById(weekend.alertId)).target_membership_id).toBe(
      ids.vet2,
    );
    expect((await alertById(weekday.alertId)).target_membership_id).toBe(
      ids.vet,
    );
    const lou = await actor(ids.admin);
    for (const id of [weekend.alertId, weekday.alertId])
      await alertsApi.resolve(lou, id);
    await drain();
  });
});

describe("droits, isolation et garde-fous de la base", () => {
  let alertId: string;

  beforeAll(async () => {
    const { messageId } = await conversations.receiveOwnerMessage(
      org,
      plume,
      "Il respire mal",
    );
    alertId = (await alertOfMessage(messageId)).id;
  });

  it("une assistante ne voit les alertes qu'avec l'accès clinique, et ne décide jamais", async () => {
    const lina = await actor(ids.assistant);
    expect(await alertsApi.open(lina)).toEqual([]);
    expect(await domainError(alertsApi.acknowledge(lina, alertId))).toBe(
      "not_found",
    );
    await admin.query(
      "INSERT INTO membership_permissions (organization_id, membership_id, permission) VALUES ($1, $2, 'clinical.read')",
      [org, ids.assistant],
    );
    const allowed = await actor(ids.assistant);
    const [seen] = await alertsApi.open(allowed);
    expect(seen).toMatchObject({ id: alertId, canAcknowledge: false });
    expect(await domainError(alertsApi.acknowledge(allowed, alertId))).toBe(
      "forbidden",
    );
    expect(await domainError(alertsApi.resolve(allowed, alertId))).toBe(
      "forbidden",
    );
  });

  it("un autre cabinet ne voit ni ne touche rien", async () => {
    const olga = await actor(ids.outsider, other);
    expect(await alertsApi.open(olga)).toEqual([]);
    expect(await domainError(alertsApi.acknowledge(olga, alertId))).toBe(
      "not_found",
    );
    expect(await domainError(alertsApi.ofFollowup(olga, plume))).toBe(
      "not_found",
    );
  });

  it("la base refuse une escalade avant l'heure, une réception sans accusé et une alerte rouverte", async () => {
    await expect(
      admin.query(
        "UPDATE alerts SET status = 'escalated', escalated_at = now() WHERE id = $1",
        [alertId],
      ),
    ).rejects.toThrow(/avant l'heure/);
    await expect(
      admin.query("UPDATE alerts SET status = 'acknowledged' WHERE id = $1", [
        alertId,
      ]),
    ).rejects.toThrow(/accusé de réception manquant/);
    await alertsApi.resolve(await actor(ids.vet), alertId);
    await expect(
      admin.query(
        "UPDATE alerts SET status = 'open', resolved_at = NULL, resolved_by_membership_id = NULL WHERE id = $1",
        [alertId],
      ),
    ).rejects.toThrow(/refusé/);
  });

  it("après STOP, l'équipe est toujours alertée, mais plus rien ne part au propriétaire", async () => {
    expect(
      (await conversations.receiveOwnerMessage(org, plume, "STOP")).outcome,
    ).toBe("stopped");
    await drain();
    const before = ownerSent().length;
    const received = await conversations.receiveOwnerMessage(
      org,
      plume,
      "Elle ne tient plus debout",
    );
    expect(received).toMatchObject({ outcome: "stored", triage: "urgent" });
    await drain();
    expect(ownerSent().length).toBe(before);
    expect(await alertOfMessage(received.messageId)).toMatchObject({
      level: "urgent",
      status: "open",
    });
  });
});
