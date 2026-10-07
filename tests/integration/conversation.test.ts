import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createOrganization } from "../../db/seed/cabinets-fictifs";
import { fakeAiGateway, simulatedNumaReply } from "@/adapters/ai-gateway/fake";
import type { AiGateway } from "@/adapters/ai-gateway/types";
import { createFakeDrVeto } from "@/adapters/drveto/fake";
import { fakePaymentMandate } from "@/adapters/payments/fake";
import { fakeWhatsApp } from "@/adapters/whatsapp/fake";
import type { WhatsAppConnector } from "@/adapters/whatsapp/types";
import {
  conversationHandlers,
  conversationsService,
} from "@/domains/conversations/service";
import { safeFallback } from "@/domains/conversations/guard";
import { CONSENT_WORDING_VERSION } from "@/domains/conversations/wording";
import { DomainError } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import { isPermissionKey } from "@/domains/equipe/permissions";
import { protocolsService } from "@/domains/protocoles/service";
import { settingsService } from "@/domains/reglages/service";
import { launchService } from "@/domains/suivis/lancement";
import { createWorker } from "@/domains/taches/worker";
import { withTenant } from "@/server/db/tenant";

import { pools } from "./support/db";

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

const PRACTICE = "Clinique d'essai de la conversation";
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

/** WhatsApp simulé qui garde chaque envoi, et peut tomber en panne à la demande. */
type Sent = { to: string; body: string; idempotencyKey: string };
const sent: Sent[] = [];
let failNext = 0;
const whatsapp: WhatsAppConnector = {
  simulated: true,
  connectBusinessNumber: fakeWhatsApp.connectBusinessNumber,
  sendStaffAlert: fakeWhatsApp.sendStaffAlert,
  async sendMessage(input) {
    if (failNext > 0) {
      failNext -= 1;
      throw new Error("prestataire indisponible");
    }
    sent.push(input);
    return fakeWhatsApp.sendMessage(input);
  },
};
/** Passerelle IA qui compte ses appels (aucun avant l'accord du propriétaire). */
let aiCalls = 0;
let aiOverride: string | null = null;
const ai: AiGateway = {
  simulated: true,
  async numaReply(input) {
    aiCalls += 1;
    return aiOverride
      ? { text: aiOverride, intent: "ack" }
      : fakeAiGateway.numaReply(input);
  },
  numaStep: fakeAiGateway.numaStep,
  transcribeVoice: fakeAiGateway.transcribeVoice,
  observePhoto: fakeAiGateway.observePhoto,
  readAgendaCapture: fakeAiGateway.readAgendaCapture,
};
const handlers = conversationHandlers({ whatsapp, ai });
// Base partagée : les tâches laissées par les autres fichiers de test ne sont pas exécutées.
const worker = createWorker({
  db: appDb,
  workerId: "test-conversation",
  handlers: {
    "followup.message": async (context) => {
      const handler = handlers["followup.message"];
      if (handler && context.job.organizationId === org) await handler(context);
    },
  },
});

const org = randomUUID();
const other = randomUUID();
const tag = org.slice(0, 8);
let ids: { admin: string; vet: string; assistant: string; outsider: string };

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

/** Prépare puis lance un suivi par Dr Léo Vet, premier message prévu 2 h plus tard. */
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
    },
    { launch: true },
  );
  return id;
}

/** « Faire passer le temps » : les envois de ce suivi deviennent dus, puis un passage. */
async function runDue(followupId: string) {
  const leo = await actor(ids.vet);
  await conversations.makeDueNow(leo, followupId);
  await worker.runOnce();
}

async function owner(followupId: string, body: string) {
  return conversations.receiveOwnerMessage(org, followupId, body);
}

async function thread(followupId: string) {
  return (await conversations.view(await actor(ids.vet), followupId)).messages;
}

async function consentsOf(followupId: string) {
  const { rows } = await admin.query(
    `SELECT state, wording_version, message_id FROM consents
     WHERE followup_id = $1 ORDER BY recorded_at`,
    [followupId],
  );
  return rows as {
    state: string;
    wording_version: string;
    message_id: string | null;
  }[];
}

async function statusOf(followupId: string) {
  const { rows } = await admin.query(
    `SELECT f.status, (SELECT reason FROM followup_status_events e
       WHERE e.followup_id = f.id ORDER BY occurred_at DESC LIMIT 1) AS reason
     FROM followups f WHERE f.id = $1`,
    [followupId],
  );
  return rows[0] as { status: string; reason: string | null };
}

beforeAll(async () => {
  const [adminId, vet, assistant] = await createOrganization(
    appDb,
    org,
    PRACTICE,
    [
      {
        email: `ca-${tag}@essai.test`,
        displayName: "Dr Lou Admin",
        role: "admin_vet",
      },
      { email: `cv-${tag}@essai.test`, displayName: "Dr Léo Vet", role: "vet" },
      {
        email: `cs-${tag}@essai.test`,
        displayName: "Lina Asv",
        role: "assistant",
      },
    ],
  );
  const [outsider] = await createOrganization(appDb, other, "Autre cabinet", [
    {
      email: `co-${tag}@essai.test`,
      displayName: "Dr Olga Autre",
      role: "admin_vet",
    },
  ]);
  if (!adminId || !vet || !assistant || !outsider) throw new Error("cabinet");
  ids = { admin: adminId, vet, assistant, outsider };
  const lou = await actor(adminId);
  await settings.connect(lou, "drveto", "ESSAI-02");
  await settings.connect(lou, "whatsapp", "06 39 98 00 01");
  for (const key of ["sterilisation-chatte", "sterilisation-chienne"]) {
    const id = await protocols.installFromLibrary(lou, key);
    await protocols.validate(lou, id);
  }
});

let plume: string;

describe("premier message et accord du propriétaire", () => {
  it("rien ne part avant l'heure choisie ; puis Numa écrit au nom du cabinet et du vétérinaire", async () => {
    plume = await launch("DV-20481");
    await worker.runOnce();
    expect(await thread(plume)).toEqual([]);

    await runDue(plume);
    const [intro, ...rest] = await thread(plume);
    expect(rest).toEqual([]);
    expect(intro).toMatchObject({ author: "numa", delivery: "sent" });
    for (const part of [
      "Margaux",
      "Numa",
      "assistante IA",
      PRACTICE,
      "Dr Léo Vet",
      "Plume",
      "OUI",
      "STOP",
    ])
      expect(intro?.body).toContain(part);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("+33639980101");
    expect(await consentsOf(plume)).toEqual([
      {
        state: "requested",
        wording_version: CONSENT_WORDING_VERSION,
        message_id: intro?.id,
      },
    ]);
  });

  it("un premier message rejoué ne part jamais deux fois", async () => {
    await withTenant(appDb, { organizationId: org }, async (tx) => {
      const handler = handlers["followup.message"];
      if (!handler) throw new Error("exécutant manquant");
      await handler({
        tx,
        job: {
          id: randomUUID(),
          organizationId: org,
          kind: "followup.message",
          attempt: 1,
          followupId: plume,
          payload: { step: "intro" },
          idempotencyKey: `followup:${plume}:intro`,
        },
      });
    });
    expect(sent).toHaveLength(1);
    expect(await thread(plume)).toHaveLength(1);
  });

  it("avant l'accord, aucun contenu clinique : une seule relance, sans IA", async () => {
    expect((await owner(plume, "Elle a un peu saigné ce soir")).outcome).toBe(
      "consent_reminder",
    );
    expect((await owner(plume, "Vous êtes là ?")).outcome).toBe(
      "consent_reminder",
    );
    await runDue(plume);
    const reminders = (await thread(plume)).filter(
      (message) =>
        message.author === "numa" && message.body.includes("votre accord"),
    );
    expect(reminders).toHaveLength(1);
    expect(aiCalls).toBe(0);
  });

  it("OUI donne l'accord ; Numa répond ensuite par la passerelle IA et ses garde-fous", async () => {
    expect((await owner(plume, " Oui ! ")).outcome).toBe("consent_given");
    await runDue(plume);
    expect((await consentsOf(plume)).map((row) => row.state)).toEqual([
      "requested",
      "given",
    ]);
    expect((await thread(plume)).at(-1)?.body).toContain("Merci Margaux");

    const question = "Elle mange bien et dort beaucoup";
    expect((await owner(plume, question)).outcome).toBe("reply");
    await runDue(plume);
    expect(aiCalls).toBe(1);
    const reply = (await thread(plume)).at(-1);
    expect(reply).toMatchObject({ author: "numa", delivery: "sent" });
    expect(reply?.body).toBe(
      simulatedNumaReply({
        language: "fr",
        animalName: "Plume",
        practiceName: PRACTICE,
        ownerMessage: question,
      }).text,
    );
  });

  it("une réponse dangereuse de l'IA est remplacée, et seul le motif est journalisé", async () => {
    aiOverride = "Donnez-lui 2 comprimés, ce n'est pas grave.";
    try {
      await owner(plume, "Elle se lèche beaucoup");
      await runDue(plume);
    } finally {
      aiOverride = null;
    }
    expect((await thread(plume)).at(-1)?.body).toBe(
      safeFallback("fr", PRACTICE),
    );
    expect(sent.at(-1)?.body).toBe(safeFallback("fr", PRACTICE));
    const { rows } = await admin.query(
      `SELECT actor_membership_id, metadata FROM audit_events
       WHERE target_id = $1 AND action = 'numa.reply_blocked'`,
      [plume],
    );
    expect(rows).toEqual([
      { actor_membership_id: null, metadata: { reason: "dosage" } },
    ]);
  });

  it("un envoi en panne est retenté, sans doublon ni message à moitié enregistré", async () => {
    const before = sent.length;
    failNext = 1;
    await owner(plume, "Merci pour les nouvelles");
    await runDue(plume);
    expect(sent).toHaveLength(before);
    expect((await thread(plume)).at(-1)?.author).toBe("owner");
    await runDue(plume);
    expect(sent).toHaveLength(before + 1);
    expect((await thread(plume)).at(-1)?.author).toBe("numa");
  });
});

describe("reprise en main par le vétérinaire", () => {
  it("écrire au propriétaire met Numa en pause, jusqu'à « Reprendre Numa »", async () => {
    const leo = await actor(ids.vet);
    const repliesBefore = aiCalls;
    const result = await conversations.writeToOwner(
      leo,
      plume,
      "Bonjour Margaux, c'est Dr Léo. Tout se passe bien ?",
    );
    expect(result.takeover).toBe(true);
    expect(await statusOf(plume)).toEqual({
      status: "human_takeover",
      reason: "vet_takeover",
    });
    await runDue(plume);
    expect((await thread(plume)).at(-1)).toMatchObject({
      author: "vet",
      authorName: "Dr Léo Vet",
      delivery: "sent",
    });
    expect(sent.at(-1)?.body).toContain("c'est Dr Léo");

    // Le propriétaire répond : conservé pour l'équipe, Numa se tait.
    expect((await owner(plume, "Oui très bien merci")).outcome).toBe("stored");
    await runDue(plume);
    expect(aiCalls).toBe(repliesBefore);
    expect((await thread(plume)).at(-1)?.author).toBe("owner");

    expect(
      await domainError(
        conversations.resumeNuma(await actor(ids.admin), plume),
      ),
    ).toBeUndefined();
    expect(await statusOf(plume)).toEqual({
      status: "active",
      reason: "numa_resumed",
    });
    expect((await owner(plume, "Elle a joué un peu")).outcome).toBe("reply");
    await runDue(plume);
    expect(aiCalls).toBe(repliesBefore + 1);

    const { rows } = await admin.query(
      `SELECT action, metadata FROM audit_events WHERE target_id = $1
       AND action IN ('followup.human_takeover', 'conversation.message_sent', 'followup.numa_resumed')
       ORDER BY occurred_at, action`,
      [plume],
    );
    expect(rows.map((row: { action: string }) => row.action)).toEqual([
      "conversation.message_sent",
      "followup.human_takeover",
      "followup.numa_resumed",
    ]);
    // Aucun texte de message dans le journal.
    expect(JSON.stringify(rows)).not.toContain("Margaux");
  });

  it("l'assistante autorisée écrit ; seul un vétérinaire rend la main à Numa", async () => {
    const lina = await actor(ids.assistant);
    expect(
      await domainError(conversations.writeToOwner(lina, plume, "Bonjour")),
    ).toBe("not_found");
    for (const permission of ["clinical.read", "owner_messages.reply"])
      await admin.query(
        "INSERT INTO membership_permissions (organization_id, membership_id, permission) VALUES ($1, $2, $3)",
        [org, ids.assistant, permission],
      );
    const allowed = await actor(ids.assistant);
    const view = await conversations.view(allowed, plume);
    expect(view.rights).toEqual({ canWrite: true, canResume: false });
    await conversations.writeToOwner(allowed, plume, "Bonjour, ici l'accueil.");
    expect((await statusOf(plume)).status).toBe("human_takeover");
    expect(await domainError(conversations.resumeNuma(allowed, plume))).toBe(
      "forbidden",
    );
    await conversations.resumeNuma(await actor(ids.vet), plume);
    expect(
      await domainError(conversations.resumeNuma(await actor(ids.vet), plume)),
    ).toBe("invalid_transition");
  });

  it("un message vide ou trop long est refusé", async () => {
    const leo = await actor(ids.vet);
    expect(
      await domainError(conversations.writeToOwner(leo, plume, "  ")),
    ).toBe("invalid_target");
    expect(
      await domainError(
        conversations.writeToOwner(leo, plume, "x".repeat(4097)),
      ),
    ).toBe("invalid_target");
  });
});

describe("STOP et REPRENDRE", () => {
  it("STOP retire l'accord : la confirmation part, puis plus rien, même du vétérinaire", async () => {
    const leo = await actor(ids.vet);
    // Écrit juste avant le STOP, pas encore parti : il ne partira pas.
    const { messageId } = await conversations.writeToOwner(
      leo,
      plume,
      "Pensez au collier.",
    );
    expect((await owner(plume, "stop")).outcome).toBe("stopped");
    await runDue(plume);
    const messages = await thread(plume);
    expect(messages.find((message) => message.id === messageId)?.delivery).toBe(
      "failed",
    );
    expect(sent.some((entry) => entry.body === "Pensez au collier.")).toBe(
      false,
    );
    expect(messages.at(-1)?.body).toContain("vous ne recevrez plus");

    const before = sent.length;
    expect((await owner(plume, "Elle va bien")).outcome).toBe("stored");
    await runDue(plume);
    expect(sent).toHaveLength(before);
    expect(
      await domainError(conversations.writeToOwner(leo, plume, "Bonjour")),
    ).toBe("consent_missing");
    // OUI ne suffit pas après un STOP : il faut REPRENDRE.
    expect((await owner(plume, "oui")).outcome).toBe("stored");
  });

  it("REPRENDRE recrée l'accord ; chaque état est gardé, rien n'est effacé", async () => {
    expect((await owner(plume, "REPRENDRE")).outcome).toBe("resumed");
    await runDue(plume);
    expect((await thread(plume)).at(-1)?.body).toContain("reprend");
    expect((await consentsOf(plume)).map((row) => row.state)).toEqual([
      "requested",
      "given",
      "withdrawn",
      "given",
    ]);
    const { rows } = await admin.query(
      "SELECT count(*)::int AS n FROM consents WHERE followup_id = $1 AND message_id IS NULL",
      [plume],
    );
    expect(rows[0]).toEqual({ n: 0 });
  });
});

describe("pause, langue et droits", () => {
  it("en pause, le premier message attend la reprise du suivi, puis part une seule fois", async () => {
    const leo = await actor(ids.vet);
    const tango = await launch("DV-20560");
    await launches.changeStatus(leo, tango, "pause");
    await runDue(tango);
    expect(await thread(tango)).toEqual([]);

    await launches.changeStatus(leo, tango, "resume");
    await runDue(tango);
    const messages = await thread(tango);
    expect(messages).toHaveLength(1);
    // Propriétaire anglophone : Numa écrit en anglais, toujours présentée comme une IA.
    expect(messages[0]?.body).toContain(
      "AI (artificial intelligence) assistant",
    );
    expect(messages[0]?.body).toContain("Hello Emily");
  });

  it("un suivi en brouillon ne reçoit rien ; un autre cabinet ne voit rien", async () => {
    const leo = await actor(ids.vet);
    const draft = await launches.prepare(leo, "DV-20574");
    expect(await domainError(owner(draft, "Bonjour"))).toBe(
      "invalid_transition",
    );
    const olga = await actor(ids.outsider, other);
    expect(await domainError(conversations.view(olga, plume))).toBe(
      "not_found",
    );
    expect(
      await domainError(conversations.simulateOwnerMessage(olga, plume, "oui")),
    ).toBe("not_found");
    expect(
      await domainError(conversations.receiveOwnerMessage(other, plume, "oui")),
    ).toBe("not_found");
  });

  it("le simulateur exige l'accès clinique et laisse une trace sans contenu", async () => {
    const lou = await actor(ids.admin);
    const result = await conversations.simulateOwnerMessage(
      lou,
      plume,
      "Simulation : elle dort",
    );
    // Dr Léo a repris la main juste avant le STOP : le message est gardé pour l'équipe.
    expect(result.outcome).toBe("stored");
    const { rows } = await admin.query(
      `SELECT metadata FROM audit_events WHERE target_id = $1 AND action = 'simulator.owner_message'`,
      [plume],
    );
    expect(rows).toEqual([{ metadata: { outcome: "stored" } }]);
    const lina = await actor(ids.assistant);
    await admin.query(
      "DELETE FROM membership_permissions WHERE membership_id = $1 AND permission = 'clinical.read'",
      [ids.assistant],
    );
    expect(
      await domainError(
        conversations.simulateOwnerMessage(
          await actor(ids.assistant),
          plume,
          "oui",
        ),
      ),
    ).toBe("not_found");
    expect(lina.permissions.has("clinical.read")).toBe(true);
  });
});
