import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createOrganization } from "../../db/seed/cabinets-fictifs";
import { fakeAiGateway } from "@/adapters/ai-gateway/fake";
import { createFakeDrVeto } from "@/adapters/drveto/fake";
import { fakePaymentMandate } from "@/adapters/payments/fake";
import { appointmentsService } from "@/domains/agenda/demandes";
import { slotLabel } from "@/domains/agenda/rendez-vous";
import { conversationsService } from "@/domains/conversations/service";
import { DomainError } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import { isPermissionKey } from "@/domains/equipe/permissions";
import { protocolsService } from "@/domains/protocoles/service";
import { WEEKDAYS, parisLocalToDate } from "@/domains/reglages/content";
import { settingsService } from "@/domains/reglages/service";
import { launchService } from "@/domains/suivis/lancement";

import { asApp, errorCode, pools } from "./support/db";
import { conversationWorker, recordingWhatsApp } from "./support/whatsapp";

/**
 * Rendez-vous proposés par Numa (lot 18, cahier des charges §8) : créneaux libres du seul
 * vétérinaire responsable, dans les plages approuvées ; sinon le cabinet rappelle. Seules les
 * personnes autorisées confirment, et la base le revérifie.
 */

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

const PRACTICE = "Clinique d'essai des rendez-vous";
const MARGAUX = "+33639980101";
const JULIE = "+33639980104";
const drveto = createFakeDrVeto();
const launches = launchService({ db: appDb, drveto });
const conversations = conversationsService(appDb);
const appointments = appointmentsService(appDb);
const settings = settingsService({
  db: appDb,
  whatsapp: { live: false },
  drveto,
  payments: fakePaymentMandate,
});
const protocols = protocolsService(appDb);

const whatsapp = recordingWhatsApp();
const { sent } = whatsapp;
const { worker } = conversationWorker({
  db: appDb,
  workerId: "test-rendez-vous",
  organizationId: () => org,
  whatsapp,
  ai: fakeAiGateway,
});

const org = randomUUID();
const other = randomUUID();
const tag = org.slice(0, 8);
let ids: {
  admin: string;
  vet: string;
  otherVet: string;
  assistant: string;
  outsider: string;
};

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

async function userOf(membershipId: string): Promise<string> {
  const { rows } = await admin.query(
    "SELECT user_id FROM memberships WHERE id = $1",
    [membershipId],
  );
  return (rows[0] as { user_id: string }).user_id;
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

/** Lance un suivi de Dr Léo Vet, puis le propriétaire donne son accord. */
async function launchAndAccept(ref: string): Promise<string> {
  const leo = await actor(ids.vet);
  const id = await launches.prepare(leo, ref);
  let sheet = await launches.sheet(leo, id);
  if (!sheet.protocol) {
    const option = sheet.protocolOptions[0];
    if (!option) throw new Error("aucun protocole");
    await launches.applyProtocol(leo, id, option.protocolId);
    sheet = await launches.sheet(leo, id);
  }
  await launches.save(
    leo,
    id,
    {
      firstContactHours: 0,
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
  await runDue(id);
  await owner(id, "oui");
  await runDue(id);
  return id;
}

async function runDue(followupId: string) {
  await conversations.makeDueNow(await actor(ids.vet), followupId);
  await worker.runOnce();
}

const owner = (followupId: string, body: string) =>
  conversations.receiveOwnerMessage(org, followupId, body);

const lastTo = (to: string) => sent.filter((item) => item.to === to).at(-1);

/** Demain à cette heure de Paris. */
function tomorrowAt(time: string): Date {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
  }).format(new Date(Date.now() + 86_400_000));
  const date = parisLocalToDate(`${day}T${time}`);
  if (!date) throw new Error("date");
  return date;
}

const SLOTS = ["10:00", "11:00", "14:30", "16:00"];
const at = (time: string) => tomorrowAt(time);
const label = (time: string) => slotLabel(at(time), "fr");

async function addFreeSlot(membershipId: string, time: string) {
  const startsAt = at(time);
  await admin.query(
    `INSERT INTO agenda_free_slots (organization_id, membership_id, starts_at, ends_at, created_by_membership_id)
     VALUES ($1, $2, $3, $4, $2)`,
    [org, membershipId, startsAt, new Date(startsAt.getTime() + 30 * 60_000)],
  );
}

async function requestsOf(followupId: string) {
  const { rows } = await admin.query(
    `SELECT status, kind, minutes, slot_starts FROM appointment_requests
     WHERE followup_id = $1 ORDER BY created_at`,
    [followupId],
  );
  return rows as {
    status: string;
    kind: string;
    minutes: number;
    slot_starts: Date[];
  }[];
}

async function appointmentsOf(followupId: string) {
  const { rows } = await admin.query(
    `SELECT id, status, source, membership_id, starts_at, confirmed_by_membership_id
     FROM appointments WHERE followup_id = $1 ORDER BY created_at`,
    [followupId],
  );
  return rows as {
    id: string;
    status: string;
    source: string;
    membership_id: string;
    starts_at: Date;
    confirmed_by_membership_id: string | null;
  }[];
}

beforeAll(async () => {
  const [adminId, vet, otherVet, assistant] = await createOrganization(
    appDb,
    org,
    PRACTICE,
    [
      {
        email: `ra-${tag}@essai.test`,
        displayName: "Dr Lou Admin",
        role: "admin_vet",
      },
      { email: `rv-${tag}@essai.test`, displayName: "Dr Léo Vet", role: "vet" },
      { email: `rm-${tag}@essai.test`, displayName: "Dr Mia Vet", role: "vet" },
      {
        email: `rs-${tag}@essai.test`,
        displayName: "Lina Asv",
        role: "assistant",
      },
    ],
  );
  const [outsider] = await createOrganization(appDb, other, "Autre cabinet", [
    {
      email: `ro-${tag}@essai.test`,
      displayName: "Dr Olga Autre",
      role: "admin_vet",
    },
  ]);
  if (!adminId || !vet || !otherVet || !assistant || !outsider)
    throw new Error("cabinet");
  ids = { admin: adminId, vet, otherVet, assistant, outsider };
  const lou = await actor(adminId);
  await settings.connect(lou, "drveto", "ESSAI-RDV");
  await settings.connect(lou, "whatsapp", "06 39 98 00 19");
  for (const key of ["sterilisation-chatte", "sterilisation-chienne"]) {
    const id = await protocols.installFromLibrary(lou, key);
    await protocols.validate(lou, id);
  }
  // Tous les jours de 7 h à 21 h : le test ne dépend pas du jour où il tourne.
  await settings.saveAppointmentWindows(
    lou,
    WEEKDAYS.map((weekday) => ({
      weekday,
      startsAt: "07:00",
      endsAt: "21:00",
    })),
  );
  for (const time of SLOTS) await addFreeSlot(vet, time);
  // Un créneau libre d'un autre vétérinaire : jamais proposé pour un suivi de Dr Léo.
  await addFreeSlot(otherVet, "09:00");
  await addFreeSlot(vet, "21:00");
});

let plume: string;
let sesame: string;

describe("Numa propose des créneaux", () => {
  it("jusqu'à trois créneaux libres du vétérinaire responsable, dans les plages approuvées", async () => {
    plume = await launchAndAccept("DV-20481");
    expect(
      (
        await owner(
          plume,
          "Bonjour, on peut prendre rendez-vous pour le contrôle ?",
        )
      ).outcome,
    ).toBe("reply");
    await runDue(plume);
    const offer = lastTo(MARGAUX)?.body ?? "";
    expect(offer).toContain(`1. ${label("10:00")}`);
    expect(offer).toContain(`2. ${label("11:00")}`);
    expect(offer).toContain(`3. ${label("14:30")}`);
    expect(offer).toContain("Dr Léo Vet");
    expect(offer).toContain("confirmera ensuite");
    expect(offer).not.toContain(label("09:00"));
    expect(await requestsOf(plume)).toEqual([
      {
        status: "offered",
        kind: "post_op_control",
        minutes: 20,
        slot_starts: [at("10:00"), at("11:00"), at("14:30")],
      },
    ]);
  });

  it("un autre propriétaire ne se voit jamais proposer un créneau déjà proposé", async () => {
    sesame = await launchAndAccept("DV-20533");
    await owner(sesame, "Je voudrais un rdv svp");
    await runDue(sesame);
    const offer = lastTo(JULIE)?.body ?? "";
    expect(offer).toContain(`1. ${label("16:00")}`);
    expect(offer).not.toContain("2.");
    // 21 h tombe hors de la plage (le rendez-vous finirait après 21 h) : jamais proposé.
    expect(offer).not.toContain(label("21:00"));
  });

  it("le choix d'un créneau crée un rendez-vous à confirmer par le cabinet", async () => {
    expect((await owner(plume, "2")).outcome).toBe("reply");
    await runDue(plume);
    expect(lastTo(MARGAUX)?.body).toContain(
      `confirmer le rendez-vous du ${label("11:00")}`,
    );
    const [appointment] = await appointmentsOf(plume);
    expect(appointment).toMatchObject({
      status: "proposed",
      source: "numa",
      membership_id: ids.vet,
      starts_at: at("11:00"),
      confirmed_by_membership_id: null,
    });
    expect((await requestsOf(plume))[0]?.status).toBe("chosen");
    // Un « 3 » plus tard n'est qu'un message : la proposition est déjà prise.
    expect((await owner(plume, "3")).outcome).toBe("reply");
    await runDue(plume);
    expect(await appointmentsOf(plume)).toHaveLength(1);
  });
});

describe("confirmation par le cabinet : matrice des droits", () => {
  it("un assistant sans le droit voit la demande mais ne confirme pas", async () => {
    const lina = await actor(ids.assistant);
    const desk = await appointments.desk(lina);
    expect(desk.canConfirm).toBe(false);
    expect(desk.pending.map((item) => item.animalName)).toContain("Plume");
    const [appointment] = await appointmentsOf(plume);
    if (!appointment) throw new Error("rendez-vous");
    expect(await domainError(appointments.confirm(lina, appointment.id))).toBe(
      "not_found",
    );
    expect(await domainError(appointments.decline(lina, appointment.id))).toBe(
      "not_found",
    );
  });

  it("un autre cabinet ne voit ni ne confirme rien", async () => {
    const olga = await actor(ids.outsider, other);
    const [appointment] = await appointmentsOf(plume);
    if (!appointment) throw new Error("rendez-vous");
    expect((await appointments.desk(olga)).pending).toEqual([]);
    expect(await domainError(appointments.confirm(olga, appointment.id))).toBe(
      "not_found",
    );
  });

  it("un vétérinaire qui ne voit pas le dossier ne le confirme pas", async () => {
    const mia = await actor(ids.otherVet);
    const [appointment] = await appointmentsOf(plume);
    if (!appointment) throw new Error("rendez-vous");
    expect((await appointments.desk(mia)).pending).toEqual([]);
    expect(await domainError(appointments.confirm(mia, appointment.id))).toBe(
      "not_found",
    );
  });

  it("l'assistant autorisé par l'administrateur confirme ; Numa prévient le propriétaire", async () => {
    await admin.query(
      `INSERT INTO membership_permissions (organization_id, membership_id, permission)
       VALUES ($1, $2, 'appointments.confirm')`,
      [org, ids.assistant],
    );
    const lina = await actor(ids.assistant);
    expect((await appointments.desk(lina)).canConfirm).toBe(true);
    const [appointment] = await appointmentsOf(plume);
    if (!appointment) throw new Error("rendez-vous");
    await appointments.confirm(lina, appointment.id);
    await runDue(plume);
    expect(lastTo(MARGAUX)?.body).toContain(
      `est confirmé le ${label("11:00")}`,
    );
    expect((await appointmentsOf(plume))[0]).toMatchObject({
      status: "confirmed",
      confirmed_by_membership_id: ids.assistant,
    });
    expect((await requestsOf(plume))[0]?.status).toBe("closed");
    expect(await domainError(appointments.confirm(lina, appointment.id))).toBe(
      "invalid_transition",
    );
  });

  it("l'administrateur refuse un créneau ; le vétérinaire confirme le suivant", async () => {
    await owner(sesame, "1");
    await runDue(sesame);
    const [first] = await appointmentsOf(sesame);
    if (!first) throw new Error("rendez-vous");
    await appointments.decline(await actor(ids.admin), first.id);
    await runDue(sesame);
    expect(lastTo(JULIE)?.body).toContain("n'a pas pu être retenu");

    // Le créneau refusé redevient libre : Numa peut le reproposer.
    await owner(sesame, "Un autre rendez-vous alors ?");
    await runDue(sesame);
    expect(lastTo(JULIE)?.body).toContain(label("16:00"));
    await owner(sesame, "1");
    await runDue(sesame);
    const [, second] = await appointmentsOf(sesame);
    if (!second) throw new Error("rendez-vous");
    expect(second.starts_at).toEqual(at("10:00"));
    await appointments.confirm(await actor(ids.vet), second.id);
    expect((await appointmentsOf(sesame))[1]?.status).toBe("confirmed");

    const { rows } = await admin.query(
      `SELECT action, actor_membership_id FROM audit_events
       WHERE target_id = $1 AND action LIKE 'appointment.%' ORDER BY occurred_at`,
      [sesame],
    );
    expect(rows).toEqual([
      { action: "appointment.requested", actor_membership_id: null },
      { action: "appointment.proposed", actor_membership_id: null },
      { action: "appointment.declined", actor_membership_id: ids.admin },
      { action: "appointment.requested", actor_membership_id: null },
      { action: "appointment.proposed", actor_membership_id: null },
      { action: "appointment.confirmed", actor_membership_id: ids.vet },
    ]);
  });
});

describe("sans créneau adapté, le cabinet rappelle", () => {
  it("Numa l'annonce, et la demande attend l'équipe", async () => {
    const lou = await actor(ids.admin);
    // Contrôle d'une heure : aucun créneau libre de 30 minutes ne convient.
    await settings.saveAppointmentDurations(lou, {
      post_op_control: 60,
      emergency: 30,
      treatment_followup: 20,
      other: 30,
    });
    await owner(plume, "Pouvons-nous avoir un rendez-vous de plus ?");
    await runDue(plume);
    expect(lastTo(MARGAUX)?.body).toContain("vous recontactera");
    expect((await requestsOf(plume)).at(-1)).toMatchObject({
      status: "callback",
      minutes: 60,
      slot_starts: [],
    });
    const lina = await actor(ids.assistant);
    const desk = await appointments.desk(lina);
    const callback = desk.callbacks.find((item) => item.animalName === "Plume");
    if (!callback) throw new Error("demande à rappeler");
    expect(callback.vetName).toBe("Dr Léo Vet");
    await appointments.closeCallback(lina, callback.id);
    expect((await appointments.desk(lina)).callbacks).toEqual([]);
    expect(
      await domainError(appointments.closeCallback(lina, callback.id)),
    ).toBe("invalid_transition");
  });
});

describe("la base refuse ce que l'application ne doit jamais faire", () => {
  const insertNuma = (
    client: PoolClient,
    values: {
      followupId: string;
      membershipId: string;
      startsAt: Date;
      status?: string;
    },
  ) =>
    client.query(
      `INSERT INTO appointments (organization_id, followup_id, animal_id, membership_id, kind, status, source, starts_at, ends_at)
       SELECT $1, f.id, f.animal_id, $2, 'post_op_control', $3, 'numa', $4, $5
       FROM followups f WHERE f.id = $6
       RETURNING id`,
      [
        org,
        values.membershipId,
        values.status ?? "proposed",
        values.startsAt,
        new Date(values.startsAt.getTime() + 20 * 60_000),
        values.followupId,
      ],
    );

  it("Numa ne propose ni un autre vétérinaire, ni hors plage, ni un créneau pris, ni ne confirme", async () => {
    expect(
      await asApp(app, org, (client) =>
        errorCode(
          insertNuma(client, {
            followupId: plume,
            membershipId: ids.otherVet,
            startsAt: at("09:00"),
          }),
        ),
      ),
    ).toBe("23514");
    expect(
      await asApp(app, org, (client) =>
        errorCode(
          insertNuma(client, {
            followupId: plume,
            membershipId: ids.vet,
            startsAt: at("21:00"),
          }),
        ),
      ),
    ).toBe("23514");
    expect(
      await asApp(app, org, (client) =>
        errorCode(
          insertNuma(client, {
            followupId: plume,
            membershipId: ids.vet,
            startsAt: at("10:00"),
            status: "confirmed",
          }),
        ),
      ),
    ).toBe("23514");
    // 11 h est confirmé pour Plume : aucun autre rendez-vous ne le chevauche.
    expect(
      await asApp(app, org, (client) =>
        errorCode(
          insertNuma(client, {
            followupId: plume,
            membershipId: ids.vet,
            startsAt: new Date(at("11:00").getTime() + 10 * 60_000),
          }),
        ),
      ),
    ).toBe("23P01");
    expect(
      await asApp(app, org, (client) =>
        errorCode(
          insertNuma(client, {
            followupId: plume,
            membershipId: ids.vet,
            startsAt: at("14:30"),
          }),
        ),
      ),
    ).toBeUndefined();
  });

  it("une confirmation exige le droit, par la personne connectée elle-même", async () => {
    await admin.query(
      `DELETE FROM membership_permissions WHERE membership_id = $1 AND permission = 'appointments.confirm'`,
      [ids.assistant],
    );
    const confirmAs = (confirmer: string, userId: string) =>
      asApp(app, org, async (client) => {
        await client.query("SELECT set_config('app.user_id', $1, true)", [
          userId,
        ]);
        const { rows } = await insertNuma(client, {
          followupId: plume,
          membershipId: ids.vet,
          startsAt: at("14:30"),
        });
        const id = (rows[0] as { id: string }).id;
        return errorCode(
          client.query(
            `UPDATE appointments SET status = 'confirmed', confirmed_at = now(),
             confirmed_by_membership_id = $1 WHERE id = $2`,
            [confirmer, id],
          ),
        );
      });
    // Assistant sans le droit.
    expect(await confirmAs(ids.assistant, await userOf(ids.assistant))).toBe(
      "42501",
    );
    // Au nom d'un vétérinaire, mais connecté comme l'assistant.
    expect(await confirmAs(ids.vet, await userOf(ids.assistant))).toBe("42501");
    // Le vétérinaire lui-même : accepté.
    expect(await confirmAs(ids.vet, await userOf(ids.vet))).toBeUndefined();
  });
});

describe("réglages des rendez-vous", () => {
  it("réservés à l'administrateur, validés, et lus par la page des réglages", async () => {
    const leo = await actor(ids.vet);
    expect(
      await domainError(
        settings.saveAppointmentDurations(leo, {
          post_op_control: 20,
          emergency: 30,
          treatment_followup: 20,
          other: 30,
        }),
      ),
    ).toBe("not_found");
    const lou = await actor(ids.admin);
    for (const minutes of [7, 0, 125])
      expect(
        await domainError(
          settings.saveAppointmentDurations(lou, {
            post_op_control: minutes,
            emergency: 30,
            treatment_followup: 20,
            other: 30,
          }),
        ),
      ).toBe("invalid_target");
    expect(
      await domainError(
        settings.saveAppointmentWindows(lou, [
          { weekday: 1, startsAt: "18:00", endsAt: "09:00" },
        ]),
      ),
    ).toBe("invalid_target");
    const view = await settings.get(lou);
    expect(view.appointmentMinutes.post_op_control).toBe(60);
    expect(view.appointmentWindows).toHaveLength(7);
    expect(view.messageWindows).toEqual([]);
  });
});
