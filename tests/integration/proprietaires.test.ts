import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createOrganization } from "../../db/seed/cabinets-fictifs";
import { fakeAiGateway } from "@/adapters/ai-gateway/fake";
import { createFakeDrVeto } from "@/adapters/drveto/fake";
import { fakePaymentMandate } from "@/adapters/payments/fake";
import { conversationsService } from "@/domains/conversations/service";
import { PAIR_CONSENT_WORDING_VERSION } from "@/domains/conversations/wording";
import { DomainError } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import { isPermissionKey } from "@/domains/equipe/permissions";
import { protocolsService } from "@/domains/protocoles/service";
import { settingsService } from "@/domains/reglages/service";
import { launchService } from "@/domains/suivis/lancement";

import { pools } from "./support/db";
import { conversationWorker, recordingWhatsApp } from "./support/whatsapp";

/**
 * Deux propriétaires (lot 18, cahier des charges §6) : accord de chacun avec l'explication
 * du groupe, groupe simulé dès les deux accords, STOP dans le groupe (quitter le groupe ou
 * arrêter le suivi).
 */

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

const PRACTICE = "Clinique d'essai des deux propriétaires";
const ANTOINE = "+33639980102";
const CHLOE = "+33639980103";
const drveto = createFakeDrVeto();
const launches = launchService({ db: appDb, drveto });
const conversations = conversationsService(appDb);
const settings = settingsService({
  db: appDb,
  whatsapp: { live: false },
  drveto,
  payments: fakePaymentMandate,
});
const protocols = protocolsService(appDb);

/** WhatsApp simulé qui garde chaque envoi : direct (numéro) ou au groupe (`groupe`). */
const whatsapp = recordingWhatsApp();
const { sent, groupCalls } = whatsapp;
const { worker } = conversationWorker({
  db: appDb,
  workerId: "test-proprietaires",
  organizationId: () => org,
  whatsapp,
  ai: fakeAiGateway,
});

const org = randomUUID();
const tag = org.slice(0, 8);
let ids: { admin: string; vet: string };

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

async function domainError(promise: Promise<unknown>) {
  try {
    await promise;
    return undefined;
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
}

/** Prépare Gaston (deux propriétaires importés), avec ou sans le second contact, puis lance. */
async function launchGaston(secondContactActive: boolean): Promise<string> {
  const leo = await actor(ids.vet);
  const id = await launches.prepare(leo, "DV-20517");
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
      secondContactActive,
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
  return id;
}

async function runDue(followupId: string) {
  await conversations.makeDueNow(await actor(ids.vet), followupId);
  await worker.runOnce();
}

const antoine = (followupId: string, body: string) =>
  conversations.receiveOwnerMessage(org, followupId, body, "primary");
const chloe = (followupId: string, body: string) =>
  conversations.receiveOwnerMessage(org, followupId, body, "secondary");

async function view(followupId: string) {
  return conversations.view(await actor(ids.vet), followupId);
}

const lastTo = (to: string) => sent.filter((item) => item.to === to).at(-1);

beforeAll(async () => {
  const [adminId, vet] = await createOrganization(appDb, org, PRACTICE, [
    {
      email: `pa-${tag}@essai.test`,
      displayName: "Dr Lou Admin",
      role: "admin_vet",
    },
    { email: `pv-${tag}@essai.test`, displayName: "Dr Léo Vet", role: "vet" },
  ]);
  if (!adminId || !vet) throw new Error("cabinet");
  ids = { admin: adminId, vet };
  const lou = await actor(adminId);
  await settings.connect(lou, "drveto", "ESSAI-18");
  await settings.connect(lou, "whatsapp", "06 39 98 00 18");
  const id = await protocols.installFromLibrary(lou, "detartrage");
  await protocols.validate(lou, id);
});

let gaston: string;

describe("second contact sur la fiche de lancement", () => {
  it("sans case cochée, seul le contact principal est contacté", async () => {
    const alone = await launchGaston(false);
    await runDue(alone);
    const current = await view(alone);
    expect(current.contacts.map((contact) => contact.firstName)).toEqual([
      "Antoine",
    ]);
    expect(current.messages).toHaveLength(1);
    expect(current.messages[0]?.body).not.toContain("groupe");
    expect(sent.map((item) => item.to)).toEqual([ANTOINE]);
    expect(
      await domainError(chloe(alone, "oui")),
      "un contact inactif n'écrit pas dans le suivi",
    ).toBe("not_found");
    // Un animal n'a qu'un suivi en cours : celui-ci s'arrête pour la suite.
    await launches.changeStatus(await actor(ids.vet), alone, "stop");
  });
});

describe("accord de chacun, puis groupe", () => {
  it("chacun reçoit sa demande d'accord, qui explique le groupe", async () => {
    sent.length = 0;
    gaston = await launchGaston(true);
    await runDue(gaston);
    expect(sent.map((item) => item.to).sort()).toEqual([ANTOINE, CHLOE]);
    expect(lastTo(ANTOINE)?.body).toContain("Bonjour Antoine");
    expect(lastTo(ANTOINE)?.body).toContain("proposé aussi à Chloé");
    expect(lastTo(CHLOE)?.body).toContain("proposé aussi à Antoine");
    for (const item of sent) {
      expect(item.body).toContain("assistante IA");
      expect(item.body).toContain("groupe WhatsApp");
    }
    const { rows } = await admin.query(
      `SELECT c.state, c.wording_version, c.group_explained, c.scope
       FROM consents c WHERE c.followup_id = $1`,
      [gaston],
    );
    expect(rows).toEqual([
      {
        state: "requested",
        wording_version: PAIR_CONSENT_WORDING_VERSION,
        group_explained: true,
        scope: "contact",
      },
      {
        state: "requested",
        wording_version: PAIR_CONSENT_WORDING_VERSION,
        group_explained: true,
        scope: "contact",
      },
    ]);
  });

  it("un seul accord : pas de groupe, Numa attend l'autre propriétaire", async () => {
    expect((await antoine(gaston, "Oui")).outcome).toBe("consent_given");
    await runDue(gaston);
    expect(lastTo(ANTOINE)?.body).toContain("Dès que Chloé aura accepté");
    expect(groupCalls).toEqual([]);
    expect((await view(gaston)).group).toBe(false);
    // Chloé n'a pas encore accepté : seul Antoine reçoit les messages de l'équipe.
    expect((await view(gaston)).recipients).toEqual(["Antoine"]);
  });

  it("le second accord crée le groupe, où Numa souhaite la bienvenue aux deux", async () => {
    expect((await chloe(gaston, "oui merci")).outcome).toBe("consent_given");
    await runDue(gaston);
    expect(groupCalls).toEqual([`create:${ANTOINE},${CHLOE}`]);
    const welcome = sent.at(-1);
    expect(welcome?.to).toBe("groupe");
    expect(welcome?.body).toContain("Bonjour Antoine et Chloé");
    expect(welcome?.body).toContain("assistante IA");
    const current = await view(gaston);
    expect(current.group).toBe(true);
    expect(current.recipients).toEqual(["Antoine", "Chloé"]);
    // Trace codée, affichée dans la langue du lecteur ; le texte d'origine reste en français.
    expect(
      current.messages.find((message) => message.author === "system"),
    ).toMatchObject({
      note: { code: "group_created", names: ["Antoine", "Chloé"] },
      body: "Groupe WhatsApp du suivi créé avec Antoine et Chloé (simulé).",
    });
    expect(current.messages.at(-1)).toMatchObject({
      author: "numa",
      channel: "group",
    });
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM audit_events
       WHERE target_id = $1 AND action = 'conversation.group_created'`,
      [gaston],
    );
    expect(rows[0]).toEqual({ n: 1 });
  });

  it("dans le groupe, chacun écrit et Numa répond à tous", async () => {
    expect((await chloe(gaston, "Il a bien mangé ce midi")).outcome).toBe(
      "reply",
    );
    await runDue(gaston);
    const current = await view(gaston);
    const [question, reply] = current.messages.slice(-2);
    expect(question).toMatchObject({
      author: "owner",
      channel: "group",
      contactName: "Chloé",
    });
    expect(reply).toMatchObject({ author: "numa", channel: "group" });
    expect(sent.at(-1)?.to).toBe("groupe");
  });

  it("un message de l'équipe part au groupe", async () => {
    const leo = await actor(ids.vet);
    await conversations.writeToOwner(leo, gaston, "Bonjour à tous deux.");
    await runDue(gaston);
    expect(sent.at(-1)).toMatchObject({
      to: "groupe",
      body: "Bonjour à tous deux.",
    });
    await conversations.resumeNuma(leo, gaston);
  });
});

describe("STOP dans le groupe", () => {
  it("Numa demande en privé : quitter le groupe ou tout arrêter ; le groupe ne reçoit plus rien", async () => {
    expect((await chloe(gaston, "STOP")).outcome).toBe("stop_clarify");
    await runDue(gaston);
    expect(sent.at(-1)?.to).toBe(CHLOE);
    expect(sent.at(-1)?.body).toContain("Répondez GROUPE");
    expect(sent.at(-1)?.body).toContain("Répondez TOUT");
    const current = await view(gaston);
    expect(current.contacts.find((c) => c.role === "secondary")).toMatchObject({
      stopRequested: true,
      consent: "given",
    });
    // En attendant sa réponse, l'équipe n'écrit plus qu'à Antoine, en direct.
    expect(current.recipients).toEqual(["Antoine"]);
    const leo = await actor(ids.vet);
    await conversations.writeToOwner(
      leo,
      gaston,
      "Tout va bien de votre côté ?",
    );
    await runDue(gaston);
    expect(sent.at(-1)).toMatchObject({
      to: ANTOINE,
      body: "Tout va bien de votre côté ?",
    });
    await conversations.resumeNuma(leo, gaston);
  });

  it("GROUPE : Chloé quitte le groupe, Antoine continue, Chloé peut encore écrire", async () => {
    expect((await chloe(gaston, "Groupe")).outcome).toBe("left_group");
    await runDue(gaston);
    expect(groupCalls.at(-1)).toBe(`remove:${CHLOE}`);
    expect(sent.at(-1)?.to).toBe(CHLOE);
    expect(sent.at(-1)?.body).toContain("vous avez quitté le groupe");
    const current = await view(gaston);
    expect(current.group).toBe(true);
    expect(current.recipients).toEqual(["Antoine"]);
    expect(
      current.messages.findLast((message) => message.author === "system")?.note,
    ).toEqual({ code: "left_group", names: ["Chloé"] });
    expect(current.contacts.find((c) => c.role === "secondary")).toMatchObject({
      leftGroup: true,
      stopRequested: false,
    });

    // Chloé écrit encore : en privé, et Numa lui répond en privé.
    expect((await chloe(gaston, "Merci pour tout")).outcome).toBe("reply");
    await runDue(gaston);
    expect(sent.at(-1)?.to).toBe(CHLOE);
    expect((await view(gaston)).messages.at(-2)).toMatchObject({
      author: "owner",
      channel: "direct",
      contactName: "Chloé",
    });
  });

  it("TOUT : le suivi s'arrête pour tous, le groupe ferme, l'autre propriétaire est prévenu", async () => {
    expect((await antoine(gaston, "stop")).outcome).toBe("stop_clarify");
    await runDue(gaston);
    expect(sent.at(-1)?.to).toBe(ANTOINE);
    expect((await antoine(gaston, "TOUT")).outcome).toBe("stopped_all");
    await runDue(gaston);
    expect(groupCalls.at(-1)).toBe("close");
    expect(lastTo(ANTOINE)?.body).toContain("le suivi de Gaston s'arrête");
    expect(lastTo(CHLOE)?.body).toContain(
      "Antoine a demandé l'arrêt du suivi de Gaston",
    );
    const current = await view(gaston);
    expect(current.stoppedByOwner).toBe(true);
    expect(current.recipients).toBeNull();
    expect(current.group).toBe(false);
    expect(
      current.messages.findLast((message) => message.author === "system")?.note,
    ).toEqual({ code: "group_stopped", names: ["Antoine"] });
    const { rows } = await admin.query(
      `SELECT state, scope FROM consents WHERE followup_id = $1
       ORDER BY recorded_at DESC LIMIT 1`,
      [gaston],
    );
    expect(rows[0]).toEqual({ state: "withdrawn", scope: "followup" });

    // Chloé écrit : son message est gardé pour l'équipe, Numa se tait.
    const before = sent.length;
    expect((await chloe(gaston, "D'accord")).outcome).toBe("stored");
    await runDue(gaston);
    expect(sent).toHaveLength(before);
    const leo = await actor(ids.vet);
    expect(
      await domainError(conversations.writeToOwner(leo, gaston, "Bonjour")),
    ).toBeDefined();
  });

  it("REPRENDRE : Antoine reprend le suivi, sans groupe puisque Chloé l'a quitté", async () => {
    expect((await antoine(gaston, "Reprendre")).outcome).toBe("resumed");
    await runDue(gaston);
    expect(sent.at(-1)?.to).toBe(ANTOINE);
    const current = await view(gaston);
    expect(current.stoppedByOwner).toBe(false);
    expect(current.group).toBe(false);
    expect(current.recipients).toEqual(["Antoine"]);
    expect(groupCalls.filter((call) => call.startsWith("create"))).toHaveLength(
      1,
    );
  });

  it("le journal garde les étapes, sans aucun contenu", async () => {
    const { rows } = await admin.query(
      `SELECT action, metadata FROM audit_events WHERE target_id = $1
       AND action LIKE 'conversation.%' AND action <> 'conversation.message_sent'
       ORDER BY occurred_at`,
      [gaston],
    );
    expect(rows).toEqual([
      { action: "conversation.group_created", metadata: { members: 2 } },
      { action: "conversation.left_group", metadata: {} },
      { action: "conversation.owner_stopped_all", metadata: {} },
    ]);
  });
});
