import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createOrganization } from "../../db/seed/cabinets-fictifs";
import { fictionalPng } from "../support/png";
import { fakeAiGateway } from "@/adapters/ai-gateway/fake";
import { buildSimulatedVoiceNote } from "@/adapters/ai-gateway/simulated-voice";
import type { AiGateway } from "@/adapters/ai-gateway/types";
import { createFakeDrVeto } from "@/adapters/drveto/fake";
import { createMemoryStorage } from "@/adapters/object-storage/memory";
import { fakePaymentMandate } from "@/adapters/payments/fake";
import { fakeWhatsApp } from "@/adapters/whatsapp/fake";
import type { WhatsAppConnector } from "@/adapters/whatsapp/types";
import { agendaService } from "@/domains/agenda/captures";
import {
  conversationHandlers,
  conversationsService,
} from "@/domains/conversations/service";
import { DomainError } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import { isPermissionKey } from "@/domains/equipe/permissions";
import { teamService } from "@/domains/equipe/service";
import { signReadLink } from "@/domains/fichiers/liens";
import { mediaHandlers, mediaService } from "@/domains/fichiers/service";
import { protocolsService } from "@/domains/protocoles/service";
import { settingsService } from "@/domains/reglages/service";
import { launchService } from "@/domains/suivis/lancement";
import { followupEndHandlers } from "@/domains/suivis/rappels";
import type { JobHandler } from "@/domains/taches/worker";
import { createWorker } from "@/domains/taches/worker";
import { alertHandlers } from "@/domains/urgences/service";
import { MemoryEmailSender } from "@/adapters/email/memory";

import { pools } from "./support/db";

/**
 * Lot 16 : photos, vocaux et captures d'agenda (ADR 0019). Livrable du plan : un assistant
 * non autorisé n'obtient ni lien, ni transcription ; la capture est supprimée après lecture.
 */

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

const HOUR = 3_600_000;
const SECRET = "clé-des-liens-du-test-".repeat(3);
const drveto = createFakeDrVeto();
const storage = createMemoryStorage();
const launches = launchService({ db: appDb, drveto });
const conversations = conversationsService(appDb);
const media = mediaService({ db: appDb, storage, linkSecret: SECRET });
const settings = settingsService({
  db: appDb,
  whatsapp: fakeWhatsApp,
  drveto,
  payments: fakePaymentMandate,
});
const protocols = protocolsService(appDb);
const team = teamService({
  db: appDb,
  email: new MemoryEmailSender(),
  appUrl: "http://localhost:3000",
});

const sent: { body: string }[] = [];
const whatsapp: WhatsAppConnector = {
  ...fakeWhatsApp,
  simulated: true,
  connectBusinessNumber: fakeWhatsApp.connectBusinessNumber,
  sendStaffAlert: fakeWhatsApp.sendStaffAlert,
  async sendMessage(input) {
    sent.push(input);
    return fakeWhatsApp.sendMessage(input);
  },
};

/** IA simulée, avec des réponses imposées pour éprouver les garde-fous. */
let observationsOverride: string[] | null = null;
let agendaFailure = false;
let keysSeenWhileReading: string[] = [];
const ai: AiGateway = {
  ...fakeAiGateway,
  async observePhoto(input) {
    return observationsOverride
      ? { observations: observationsOverride }
      : fakeAiGateway.observePhoto(input);
  },
  async readAgendaCapture(input) {
    keysSeenWhileReading = storage.keys();
    if (agendaFailure) throw new Error("lecture impossible");
    return fakeAiGateway.readAgendaCapture(input);
  },
};
const agenda = agendaService({ db: appDb, storage, ai });

const org = randomUUID();
const tag = org.slice(0, 8);
let ids: { admin: string; vet: string; assistant: string };

const allHandlers: Record<string, JobHandler> = {
  ...conversationHandlers({ whatsapp, ai }),
  ...alertHandlers({ whatsapp }),
  ...followupEndHandlers(),
  ...mediaHandlers({ storage, ai }),
};
const worker = createWorker({
  db: appDb,
  workerId: "test-fichiers",
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

async function refusal(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
}

/** Lance un suivi par Dr Léo Vet, puis premier message et accord du propriétaire. */
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
    (Date.now() - sheet.followup.procedureAt.getTime()) / HOUR,
  );
  await launches.save(
    leo,
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
  await conversations.makeDueNow(leo, id);
  await drain();
  await conversations.receiveOwnerMessage(org, id, "OUI");
  await drain();
  return id;
}

async function lastNumaMessage(followupId: string): Promise<string> {
  const { rows } = await admin.query(
    `SELECT body FROM messages WHERE followup_id = $1 AND author = 'numa'
     ORDER BY occurred_at DESC, id DESC LIMIT 1`,
    [followupId],
  );
  return (rows[0] as { body: string } | undefined)?.body ?? "";
}

function linkParts(url: string) {
  const parsed = new URL(url, "http://localhost");
  return {
    expires: parsed.searchParams.get("e") ?? "",
    signature: parsed.searchParams.get("s") ?? "",
  };
}

beforeAll(async () => {
  const [adminId, vet, assistant] = await createOrganization(
    appDb,
    org,
    "Clinique d'essai des fichiers",
    [
      {
        email: `fa-${tag}@essai.test`,
        displayName: "Dr Lou Admin",
        role: "admin_vet",
      },
      { email: `fv-${tag}@essai.test`, displayName: "Dr Léo Vet", role: "vet" },
      {
        email: `fs-${tag}@essai.test`,
        displayName: "Sam Assistant",
        role: "assistant",
      },
    ],
  );
  if (!adminId || !vet || !assistant) throw new Error("cabinet");
  ids = { admin: adminId, vet, assistant };
  const lou = await actor(adminId);
  await settings.connect(lou, "drveto", "ESSAI-05");
  await settings.connect(lou, "whatsapp", "06 39 98 00 04");
  for (const key of ["sterilisation-chatte", "sterilisation-chienne"]) {
    const id = await protocols.installFromLibrary(lou, key);
    await protocols.validate(lou, id);
  }
});

let plume: string;
let photoId: string;
const photo = fictionalPng();

describe("photos du propriétaire", () => {
  it("déposée dans le stockage privé, accusé de Numa, aucune analyse par défaut", async () => {
    plume = await launchWithConsent("DV-20481");
    const result = await media.receiveOwnerMedia(org, plume, {
      kind: "photo",
      bytes: photo,
    });
    photoId = result.attachmentId;
    expect(result.outcome).toBe("reply");
    await drain();
    expect(await lastNumaMessage(plume)).toContain(
      "la photo de Plume est bien arrivée",
    );

    const { rows } = await admin.query(
      `SELECT kind, content_type, byte_size, sha256, storage_key, retention_until, created_at
       FROM attachments WHERE id = $1`,
      [photoId],
    );
    const row = rows[0] as {
      kind: string;
      content_type: string;
      byte_size: number;
      storage_key: string;
      retention_until: Date;
      created_at: Date;
    };
    expect(row).toMatchObject({
      kind: "photo",
      content_type: "image/png",
      byte_size: photo.length,
    });
    // La clé ne contient que des identifiants ; l'objet est bien dans le stockage.
    expect(row.storage_key).toBe(`o/${org}/suivis/${plume}/${photoId}.png`);
    expect(storage.keys()).toContain(row.storage_key);
    // Analyse photo désactivée par défaut : aucune tâche, aucune observation.
    const { rows: jobs } = await admin.query(
      "SELECT 1 FROM scheduled_jobs WHERE organization_id = $1 AND kind = 'media.observe'",
      [org],
    );
    expect(jobs).toEqual([]);

    const view = await conversations.view(await actor(ids.vet), plume);
    const message = view.messages.find((m) => m.attachment?.id === photoId);
    expect(message?.attachment).toEqual({
      id: photoId,
      kind: "photo",
      durationMs: null,
      deleted: false,
      transcript: null,
      observations: [],
    });
  });

  it("refuse un fichier qui n'est pas une image (type lu dans le contenu)", async () => {
    const before = storage.keys().length;
    for (const bytes of [
      new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      new TextEncoder().encode("<html><script>alert(1)</script>"),
      new Uint8Array(),
    ])
      expect(
        await refusal(
          media.receiveOwnerMedia(org, plume, { kind: "photo", bytes }),
        ),
      ).toBe("invalid_file");
    expect(storage.keys()).toHaveLength(before);
  });

  it("analyse activée par le cabinet : observations seulement, garde-fous appliqués", async () => {
    const lou = await actor(ids.admin);
    await settings.saveAlertSettings(lou, {
      escalationDelayMinutes: 240,
      photoAnalysisEnabled: true,
    });
    const first = await media.receiveOwnerMedia(org, plume, {
      kind: "photo",
      bytes: fictionalPng(32, 32),
      caption: "Voici la cicatrice ce matin",
    });
    await drain();
    observationsOverride = [
      "C'est probablement une infection de la plaie.",
      "Zone rosée visible le long de la suture.",
      "Donnez-lui un comprimé ce soir.",
    ];
    const second = await media.receiveOwnerMedia(org, plume, {
      kind: "photo",
      bytes: fictionalPng(16, 16),
    });
    await drain();
    observationsOverride = null;

    const view = await conversations.view(await actor(ids.vet), plume);
    const byId = (id: string) =>
      view.messages.find((m) => m.attachment?.id === id)?.attachment;
    expect(byId(first.attachmentId)?.observations).toEqual([
      "Analyse simulée : aucune image n'est réellement examinée dans cette version.",
      "Une photo de Plume a été reçue ; seul le vétérinaire peut l'interpréter.",
    ]);
    // Diagnostic et conseil de traitement écartés, l'observation seule est gardée.
    expect(byId(second.attachmentId)?.observations).toEqual([
      "Zone rosée visible le long de la suture.",
    ]);
    const { rows } = await admin.query(
      `SELECT metadata FROM audit_events WHERE organization_id = $1
       AND action = 'photo.observation_blocked' ORDER BY metadata ->> 'reason'`,
      [org],
    );
    // Même transaction, même horodatage : l'ordre est celui des motifs.
    expect(rows.map((row: { metadata: unknown }) => row.metadata)).toEqual([
      { reason: "diagnosis" },
      { reason: "dosage" },
    ]);
    await settings.saveAlertSettings(lou, {
      escalationDelayMinutes: 240,
      photoAnalysisEnabled: false,
    });
  });
});

let voiceId: string;

describe("messages vocaux", () => {
  it("transcrits (simulé), puis traités comme un message écrit : urgence comprise", async () => {
    const result = await media.receiveOwnerMedia(org, plume, {
      kind: "voice",
      bytes: buildSimulatedVoiceNote("Elle respire mal depuis une heure"),
    });
    voiceId = result.attachmentId;
    // Rien n'est décidé avant la transcription.
    expect(result.outcome).toBe("stored");
    await drain();

    const { rows } = await admin.query(
      `SELECT t.text, t.engine, a.duration_ms, a.content_type
       FROM voice_transcripts t JOIN attachments a ON a.id = t.attachment_id
       WHERE t.attachment_id = $1`,
      [voiceId],
    );
    expect(rows[0]).toEqual({
      text: "Elle respire mal depuis une heure",
      engine: "simulated",
      duration_ms: 3000,
      content_type: "audio/wav",
    });
    const { rows: alerts } = await admin.query(
      `SELECT a.level FROM alerts a JOIN triage_events t ON t.id = a.triage_event_id
       JOIN attachments f ON f.message_id = t.message_id WHERE f.id = $1`,
      [voiceId],
    );
    expect(alerts).toEqual([{ level: "urgent" }]);
    expect(sent.some((m) => m.body.includes("Consignes du cabinet"))).toBe(
      true,
    );

    const view = await conversations.view(await actor(ids.vet), plume);
    expect(
      view.messages.find((m) => m.attachment?.id === voiceId)?.attachment,
    ).toMatchObject({
      kind: "voice",
      durationMs: 3000,
      transcript: "Elle respire mal depuis une heure",
    });
  });
});

describe("droits sur les fichiers", () => {
  it("un assistant non autorisé n'obtient ni lien, ni transcription", async () => {
    const sam = await actor(ids.assistant);
    expect(sam.permissions.has("clinical.read")).toBe(false);
    expect(await refusal(media.readLinks(sam, plume))).toBe("not_found");
    expect(await refusal(conversations.view(sam, plume))).toBe("not_found");

    // Le lien du vétérinaire, transmis à l'assistant, ne s'ouvre pas pour lui.
    const links = await media.readLinks(await actor(ids.vet), plume);
    const link = links[photoId];
    if (!link) throw new Error("lien attendu");
    expect(await refusal(media.open(sam, photoId, linkParts(link.url)))).toBe(
      "not_found",
    );
    const opened = await media.open(
      await actor(ids.vet),
      photoId,
      linkParts(link.url),
    );
    expect(opened.contentType).toBe("image/png");
    expect(Buffer.from(opened.bytes).equals(photo)).toBe(true);
    // Lien de vocal pour une photo, ou lien altéré : refusé.
    const voiceLink = links[voiceId];
    if (!voiceLink) throw new Error("lien attendu");
    expect(
      await refusal(
        media.open(await actor(ids.vet), photoId, linkParts(voiceLink.url)),
      ),
    ).toBe("not_found");
  });

  it("un droit ouvert puis retiré s'applique à l'ouverture même du lien", async () => {
    const lou = await actor(ids.admin);
    await team.setPermissions(lou, ids.assistant, [
      "followups.read_summary",
      "agenda.read",
      "clinical.read",
    ]);
    const sam = await actor(ids.assistant);
    const link = (await media.readLinks(sam, plume))[photoId];
    if (!link) throw new Error("lien attendu");
    expect(
      (await media.open(sam, photoId, linkParts(link.url))).bytes,
    ).toHaveLength(photo.length);
    await team.setPermissions(lou, ids.assistant, [
      "followups.read_summary",
      "agenda.read",
    ]);
    expect(
      await refusal(
        media.open(await actor(ids.assistant), photoId, linkParts(link.url)),
      ),
    ).toBe("not_found");
  });

  it("lien périmé, fichier supprimé : refusés ; chaque ouverture est journalisée sans contenu", async () => {
    const leo = await actor(ids.vet);
    const old = signReadLink({
      secret: SECRET,
      attachmentId: photoId,
      membershipId: ids.vet,
      now: new Date(Date.now() - 10 * 60_000),
    });
    expect(await refusal(media.open(leo, photoId, linkParts(old.url)))).toBe(
      "not_found",
    );

    const { rows } = await admin.query(
      `SELECT actor_membership_id, metadata FROM audit_events
       WHERE organization_id = $1 AND action = 'attachment.opened'`,
      [org],
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const row of rows as { metadata: Record<string, unknown> }[])
      expect(Object.keys(row.metadata).sort()).toEqual([
        "attachmentId",
        "kind",
      ]);

    const link = (await media.readLinks(leo, plume))[photoId];
    if (!link) throw new Error("lien attendu");
    await admin.query(
      "UPDATE attachments SET deleted_at = now() WHERE id = $1",
      [photoId],
    );
    expect(await refusal(media.open(leo, photoId, linkParts(link.url)))).toBe(
      "not_found",
    );
    expect(Object.keys(await media.readLinks(leo, plume))).not.toContain(
      photoId,
    );
    const view = await conversations.view(leo, plume);
    expect(
      view.messages.find((m) => m.attachment?.id === photoId)?.attachment
        ?.deleted,
    ).toBe(true);
  });
});

describe("capture d'agenda", () => {
  it("créneaux lus, capture supprimée aussitôt (fichier et stockage)", async () => {
    const leo = await actor(ids.vet);
    const before = storage.keys();
    const { attachmentId, slotCount } = await agenda.importCapture(leo, {
      vetMembershipId: ids.vet,
      bytes: fictionalPng(120, 80),
    });
    expect(slotCount).toBe(8);
    const key = `o/${org}/captures/${attachmentId}`;
    // Présente pendant la lecture, absente juste après.
    expect(keysSeenWhileReading).toContain(key);
    expect(storage.keys()).toEqual(before);
    const { rows } = await admin.query(
      `SELECT followup_id, deleted_at, retention_until - created_at <= interval '1 day' AS short
       FROM attachments WHERE id = $1`,
      [attachmentId],
    );
    expect(rows[0]).toMatchObject({ followup_id: null, short: true });
    expect((rows[0] as { deleted_at: Date | null }).deleted_at).not.toBeNull();

    // Les créneaux sont lisibles avec le seul droit de consulter l'agenda.
    const slots = await agenda.freeSlots(await actor(ids.assistant));
    expect(slots).toHaveLength(8);
    expect(new Set(slots.map((slot) => slot.vetName))).toEqual(
      new Set(["Dr Léo Vet"]),
    );
    expect((await agenda.recentCaptures(leo))[0]?.deletedAt).toBeInstanceOf(
      Date,
    );
  });

  it("illisible : supprimée quand même, les créneaux précédents restent", async () => {
    const leo = await actor(ids.vet);
    agendaFailure = true;
    const before = storage.keys();
    expect(
      await refusal(
        agenda.importCapture(leo, {
          vetMembershipId: ids.vet,
          bytes: fictionalPng(10, 10),
        }),
      ),
    ).toBe("capture_unreadable");
    agendaFailure = false;
    expect(storage.keys()).toEqual(before);
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM attachments
       WHERE organization_id = $1 AND kind = 'agenda_capture' AND deleted_at IS NULL`,
      [org],
    );
    expect(rows[0]).toEqual({ n: 0 });
    expect(await agenda.freeSlots(leo)).toHaveLength(8);
  });

  it("filet de sécurité : la tâche de suppression efface une capture restée après une panne", async () => {
    const { rows } = await admin.query(
      `SELECT a.id, a.storage_key, j.id AS job_id FROM attachments a
       JOIN scheduled_jobs j ON j.payload->>'attachmentId' = a.id::text AND j.kind = 'attachment.purge'
       WHERE a.organization_id = $1 AND a.kind = 'agenda_capture' LIMIT 1`,
      [org],
    );
    const capture = rows[0] as {
      id: string;
      storage_key: string;
      job_id: string;
    };
    // Panne simulée entre le dépôt et la suppression.
    await admin.query(
      "UPDATE attachments SET deleted_at = NULL WHERE id = $1",
      [capture.id],
    );
    await storage.putObject(capture.storage_key, {
      bytes: fictionalPng(),
      contentType: "image/png",
    });
    await admin.query(
      "UPDATE scheduled_jobs SET run_at = now() WHERE id = $1",
      [capture.job_id],
    );
    await drain();
    expect(await storage.hasObject(capture.storage_key)).toBe(false);
    const { rows: after } = await admin.query(
      "SELECT deleted_at FROM attachments WHERE id = $1",
      [capture.id],
    );
    expect((after[0] as { deleted_at: Date | null }).deleted_at).not.toBeNull();
  });

  it("réservée à agenda.capture ; un fichier qui n'est pas une image est refusé", async () => {
    const sam = await actor(ids.assistant);
    const png = fictionalPng();
    expect(
      await refusal(
        agenda.importCapture(sam, { vetMembershipId: ids.vet, bytes: png }),
      ),
    ).toBe("not_found");
    const slot = (await agenda.freeSlots(sam))[0];
    if (!slot) throw new Error("créneau attendu");
    expect(await refusal(agenda.removeSlot(sam, slot.id))).toBe("not_found");

    const leo = await actor(ids.vet);
    expect(
      await refusal(
        agenda.importCapture(leo, {
          vetMembershipId: ids.vet,
          bytes: new TextEncoder().encode("%PDF-1.7"),
        }),
      ),
    ).toBe("invalid_file");
    // Le vétérinaire choisi doit être un vétérinaire actif du cabinet.
    expect(
      await refusal(
        agenda.importCapture(leo, {
          vetMembershipId: ids.assistant,
          bytes: png,
        }),
      ),
    ).toBe("invalid_target");

    // Un assistant autorisé par l'administrateur peut envoyer une capture.
    await team.setPermissions(await actor(ids.admin), ids.assistant, [
      "followups.read_summary",
      "agenda.read",
      "agenda.capture",
    ]);
    const allowed = await actor(ids.assistant);
    expect(
      (
        await agenda.importCapture(allowed, {
          vetMembershipId: ids.vet,
          bytes: png,
        })
      ).slotCount,
    ).toBe(8);
    await agenda.removeSlot(
      allowed,
      (await agenda.freeSlots(allowed))[0]?.id ?? "",
    );
    expect(await agenda.freeSlots(allowed)).toHaveLength(7);
  });
});
