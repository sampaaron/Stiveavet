import { randomBytes, randomInt, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createOrganization } from "../../db/seed/cabinets-fictifs";
import { fakeAiGateway } from "@/adapters/ai-gateway/fake";
import { createFakeDrVeto } from "@/adapters/drveto/fake";
import type { EmailMessage } from "@/adapters/email/types";
import { createMemoryStorage } from "@/adapters/object-storage/memory";
import { fakePaymentMandate } from "@/adapters/payments/fake";
import { metaImitation } from "@/adapters/whatsapp/imitation";
import { embeddedSignup } from "@/adapters/whatsapp/inscription";
import { conversationsService } from "@/domains/conversations/service";
import { DomainError } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import { isPermissionKey } from "@/domains/equipe/permissions";
import { protocolsService } from "@/domains/protocoles/service";
import { settingsService } from "@/domains/reglages/service";
import { launchService } from "@/domains/suivis/lancement";
import { liveProvider, tokenContext } from "@/domains/whatsapp/connexion";
import type { WhatsAppSetup } from "@/domains/whatsapp/connexion";
import { mediaHandlers } from "@/domains/fichiers/service";
import { failureEmailHandlers } from "@/domains/whatsapp/echecs";
import { FAILURE_EMAIL_JOB, SEND_JOB } from "@/domains/whatsapp/envoi";
import { MEDIA_JOB, mediaDownloadHandlers } from "@/domains/whatsapp/medias";
import {
  handleWebhook,
  validSignature,
  webhookPayload,
} from "@/domains/whatsapp/webhook";
import { parseSecretKeys, secretBox } from "@/server/crypto/secret-box";
import { whatsappAccounts } from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";

import { pools } from "./support/db";
import { conversationWorker } from "./support/whatsapp";

/**
 * WhatsApp réel (ADR 0024), de bout en bout contre l'imitation locale de Meta : inscription
 * intégrée, envois en modèle ou en texte libre selon la fenêtre de 24 h, webhooks signés,
 * accusés et échecs. Aucun appel réseau, aucun compte.
 */

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

const PRACTICE = "Clinique d'essai WhatsApp";
const OWNER_PHONE = "+33639980101";
const ACCESS_TOKEN = `EAAG${randomBytes(24).toString("hex")}`;
/** Identifiants Meta propres à ce passage : la base est partagée entre fichiers de test. */
const digits = (length: number) =>
  Array.from({ length }, (_, index) => randomInt(index === 0 ? 1 : 0, 10)).join(
    "",
  );
const PHONE_NUMBER_ID = digits(15);
const WABA_ID = digits(15);
const SIGNUP_CODE = `code-${randomUUID()}`;

const meta = metaImitation({
  accessToken: ACCESS_TOKEN,
  signup: {
    code: SIGNUP_CODE,
    wabaId: WABA_ID,
    phoneNumberId: PHONE_NUMBER_ID,
    displayPhone: "+33 1 23 45 67 89",
  },
});
const box = secretBox(
  parseSecretKeys(`test:${randomBytes(32).toString("base64")}`),
);

function liveSetup(imitation: typeof meta): WhatsAppSetup {
  return {
    live: true,
    signup: embeddedSignup({
      fetch: imitation.fetch,
      appId: imitation.appId,
      appSecret: imitation.appSecret,
    }),
    box,
    appId: imitation.appId,
    configId: "2000000000002",
  };
}

const drveto = createFakeDrVeto();
const settings = settingsService({
  db: appDb,
  whatsapp: liveSetup(meta),
  drveto,
  payments: fakePaymentMandate,
});
const launches = launchService({ db: appDb, drveto });
const conversations = conversationsService(appDb);
const protocols = protocolsService(appDb);

const emails: EmailMessage[] = [];
const storage = createMemoryStorage();
const provider = liveProvider({ fetch: meta.fetch, box });
const downloads = mediaDownloadHandlers({ whatsapp: provider, storage });
const { worker } = conversationWorker({
  db: appDb,
  workerId: "test-whatsapp",
  organizationId: () => org,
  whatsapp: { provider },
  ai: fakeAiGateway,
  extra: {
    ...failureEmailHandlers({
      email: {
        async send(message) {
          emails.push(message);
        },
      },
      appUrl: "http://localhost:3000",
    }),
    ...mediaHandlers({ storage, ai: fakeAiGateway }),
    ...downloads.handlers,
  },
  extraDead: downloads.dead,
});

const org = randomUUID();
const other = randomUUID();
const tag = org.slice(0, 8);
let ids: { admin: string; vet: string; outsider: string };

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

/** Les tâches dues de ce suivi passent, jusqu'à ce qu'il n'y en ait plus. */
async function drain(followupId: string) {
  const leo = await actor(ids.vet);
  for (let round = 0; round < 6; round += 1) {
    await conversations.makeDueNow(leo, followupId);
    await worker.runOnce();
  }
}

/** Corps de webhook tel que Meta l'envoie au numéro du cabinet. */
function webhookBody(value: {
  messages?: unknown[];
  statuses?: unknown[];
  phoneNumberId?: string;
}): string {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: WABA_ID,
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "33123456789",
                phone_number_id: value.phoneNumberId ?? PHONE_NUMBER_ID,
              },
              ...(value.messages
                ? {
                    contacts: [{ wa_id: OWNER_PHONE.slice(1) }],
                    messages: value.messages,
                  }
                : {}),
              ...(value.statuses ? { statuses: value.statuses } : {}),
            },
          },
        ],
      },
    ],
  });
}

/** Ce que fait la route : signature vérifiée sur le corps brut, puis traitement. */
async function deliverWebhook(
  body: string,
  signature: string | null = meta.sign(body),
) {
  const raw = new TextEncoder().encode(body);
  if (!validSignature(raw, signature, meta.appSecret)) return "refusé";
  return handleWebhook(appDb, webhookPayload.parse(JSON.parse(body)));
}

const seconds = () => String(Math.floor(Date.now() / 1000));

/** Le propriétaire écrit depuis WhatsApp : Meta ouvre sa fenêtre et envoie le webhook. */
async function ownerWrites(text: string, wamid = `wamid.IN${randomUUID()}`) {
  meta.userWrites(OWNER_PHONE);
  const body = webhookBody({
    messages: [
      {
        from: OWNER_PHONE.slice(1),
        id: wamid,
        timestamp: seconds(),
        type: "text",
        text: { body: text },
      },
    ],
  });
  return { body, result: await deliverWebhook(body) };
}

function statusBody(
  wamid: string,
  status: string,
  errors?: { code: number }[],
): string {
  return webhookBody({
    statuses: [
      {
        id: wamid,
        status,
        timestamp: seconds(),
        recipient_id: OWNER_PHONE.slice(1),
        ...(errors ? { errors } : {}),
      },
    ],
  });
}

async function messagesOf(followupId: string) {
  const { rows } = await admin.query(
    `SELECT id, direction, author, body, delivery_status, template_key, external_ref, error_code
     FROM messages WHERE followup_id = $1 ORDER BY occurred_at, id`,
    [followupId],
  );
  return rows as {
    id: string;
    direction: "inbound" | "outbound";
    author: string;
    body: string;
    delivery_status: string | null;
    template_key: string | null;
    external_ref: string | null;
    error_code: string | null;
  }[];
}

/** Prépare puis lance un suivi par Dr Léo Vet, avec l'accord WhatsApp du propriétaire. */
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
      whatsappOptIn: true,
    },
    { launch: true },
  );
  return id;
}

beforeAll(async () => {
  const [adminId, vet] = await createOrganization(appDb, org, PRACTICE, [
    {
      email: `wa-${tag}@essai.test`,
      displayName: "Dr Lou Admin",
      role: "admin_vet",
    },
    { email: `wv-${tag}@essai.test`, displayName: "Dr Léo Vet", role: "vet" },
  ]);
  const [outsider] = await createOrganization(appDb, other, "Autre cabinet", [
    {
      email: `wo-${tag}@essai.test`,
      displayName: "Dr Olga Autre",
      role: "admin_vet",
    },
  ]);
  if (!adminId || !vet || !outsider) throw new Error("cabinet");
  ids = { admin: adminId, vet, outsider };
  const lou = await actor(adminId);
  await settings.connect(lou, "drveto", "ESSAI-21");
  for (const key of ["sterilisation-chatte", "sterilisation-chienne"]) {
    const id = await protocols.installFromLibrary(lou, key);
    await protocols.validate(lou, id);
  }
});

describe("connexion du numéro par l'inscription intégrée de Meta", () => {
  const signup = {
    code: SIGNUP_CODE,
    wabaId: WABA_ID,
    phoneNumberId: PHONE_NUMBER_ID,
    pin: "246810",
  };

  it("en mode réel, le numéro simulé n'existe plus et un mauvais code ne connecte rien", async () => {
    const lou = await actor(ids.admin);
    expect(settings.whatsappSignup()).toEqual({
      appId: meta.appId,
      configId: "2000000000002",
    });
    expect(
      await domainError(settings.connect(lou, "whatsapp", "06 39 98 00 01")),
    ).toBe("invalid_target");
    expect(
      await domainError(
        settings.connectWhatsApp(lou, { ...signup, code: "code-inconnu-1234" }),
      ),
    ).toBe("whatsapp_signup_failed");
    expect(
      await domainError(settings.connectWhatsApp(await actor(ids.vet), signup)),
    ).toBe("not_found");
    const { rows } = await admin.query(
      "SELECT 1 FROM whatsapp_accounts WHERE organization_id = $1",
      [org],
    );
    expect(rows).toEqual([]);
  });

  it("le code est échangé côté serveur, le jeton chiffré, le numéro abonné et inscrit", async () => {
    await settings.connectWhatsApp(await actor(ids.admin), signup);
    expect(meta.signupState).toEqual({
      codeUsed: true,
      subscribed: true,
      pin: "246810",
    });
    const { rows } = await admin.query(
      `SELECT waba_id, phone_number_id, access_token_sealed FROM whatsapp_accounts
       WHERE organization_id = $1`,
      [org],
    );
    const account = rows[0] as
      | {
          waba_id: string;
          phone_number_id: string;
          access_token_sealed: string;
        }
      | undefined;
    expect(account).toMatchObject({
      waba_id: WABA_ID,
      phone_number_id: PHONE_NUMBER_ID,
    });
    // Jamais en clair en base, et lisible seulement pour ce cabinet.
    expect(account?.access_token_sealed).not.toContain(ACCESS_TOKEN);
    expect(
      box.open(account?.access_token_sealed ?? "", tokenContext(org)),
    ).toBe(ACCESS_TOKEN);
    expect(() =>
      box.open(account?.access_token_sealed ?? "", tokenContext(other)),
    ).toThrow();
    const view = await settings.get(await actor(ids.admin));
    expect(view.integrations.whatsapp).toMatchObject({
      live: true,
      displayLabel: "•• •• •• •• 89",
    });
    const { rows: audits } = await admin.query(
      `SELECT metadata::text AS metadata FROM audit_events
       WHERE organization_id = $1 AND target_type = 'integration'`,
      [org],
    );
    for (const row of audits as { metadata: string }[]) {
      expect(row.metadata).not.toContain(ACCESS_TOKEN);
      expect(row.metadata).not.toContain("246810");
    }
  });

  it("un code ne sert qu'une fois, et un numéro ne sert qu'à un cabinet", async () => {
    expect(
      await domainError(
        settings.connectWhatsApp(await actor(ids.admin), signup),
      ),
    ).toBe("whatsapp_signup_failed");
    // Un autre cabinet obtient de Meta le même numéro (compte partagé) : refusé.
    const otherCode = `code-${randomUUID()}`;
    const otherMeta = metaImitation({
      accessToken: `EAAG${randomBytes(24).toString("hex")}`,
      signup: {
        code: otherCode,
        wabaId: WABA_ID,
        phoneNumberId: PHONE_NUMBER_ID,
        displayPhone: "+33 1 23 45 67 89",
      },
    });
    const otherSettings = settingsService({
      db: appDb,
      whatsapp: liveSetup(otherMeta),
      drveto,
      payments: fakePaymentMandate,
    });
    expect(
      await domainError(
        otherSettings.connectWhatsApp(await actor(ids.outsider, other), {
          ...signup,
          code: otherCode,
        }),
      ),
    ).toBe("whatsapp_number_taken");
    // Et le jeton du premier cabinet reste invisible depuis l'autre.
    const seen = await withTenant(appDb, { organizationId: other }, (tx) =>
      tx.select().from(whatsappAccounts),
    );
    expect(seen).toEqual([]);
  });
});

let plume: string;

describe("envois et webhooks", () => {
  it("le premier message part en modèle approuvé ; le texte gardé est celui que lit le propriétaire", async () => {
    plume = await launch("DV-20481");
    await drain(plume);
    const [intro] = await messagesOf(plume);
    expect(intro).toMatchObject({
      author: "numa",
      delivery_status: "sent",
      template_key: "suivi_premier_message",
    });
    expect(meta.sent).toHaveLength(1);
    const [first] = meta.sent;
    expect(first).toMatchObject({
      type: "template",
      template: "suivi_premier_message",
      to: OWNER_PHONE,
      phoneNumberId: PHONE_NUMBER_ID,
      reference: intro?.id,
      body: intro?.body,
    });
    expect(intro?.external_ref).toBe(first?.wamid);
  });

  it("un webhook signé enregistre la réponse ; rejoué, il ne crée rien ; falsifié, il est refusé", async () => {
    const wamid = `wamid.IN${randomUUID()}`;
    const { body, result } = await ownerWrites("Oui", wamid);
    expect(result).toEqual({ messages: 1, statuses: 0, ignored: 0 });
    expect(await deliverWebhook(body)).toEqual({
      messages: 0,
      statuses: 0,
      ignored: 1,
    });
    const inbound = (await messagesOf(plume)).filter(
      (message) => message.direction === "inbound",
    );
    expect(inbound).toHaveLength(1);
    const { rows } = await admin.query(
      "SELECT state FROM consents WHERE followup_id = $1 ORDER BY recorded_at",
      [plume],
    );
    expect(rows.map((row: { state: string }) => row.state)).toEqual([
      "requested",
      "given",
    ]);

    const forged = webhookBody({
      messages: [
        {
          from: OWNER_PHONE.slice(1),
          id: `wamid.IN${randomUUID()}`,
          timestamp: seconds(),
          type: "text",
          text: { body: "STOP" },
        },
      ],
    });
    expect(await deliverWebhook(forged, `sha256=${"0".repeat(64)}`)).toBe(
      "refusé",
    );
    expect(await deliverWebhook(forged, meta.sign(body))).toBe("refusé");
    expect(await deliverWebhook(forged, null)).toBe("refusé");
    // Numéro Meta inconnu : accusé sans traitement.
    const stranger = webhookBody({
      phoneNumberId: digits(15),
      messages: [
        {
          from: OWNER_PHONE.slice(1),
          id: `wamid.IN${randomUUID()}`,
          timestamp: seconds(),
          type: "text",
          text: { body: "Bonjour" },
        },
      ],
    });
    expect(await deliverWebhook(stranger)).toEqual({
      messages: 0,
      statuses: 0,
      ignored: 1,
    });

    // Le remerciement part en texte libre : la fenêtre vient de s'ouvrir.
    await drain(plume);
    const thanks = (await messagesOf(plume)).at(-1);
    expect(thanks).toMatchObject({
      author: "numa",
      delivery_status: "sent",
      template_key: null,
    });
    expect(meta.sent.at(-1)).toMatchObject({
      type: "text",
      body: thanks?.body,
    });
  });

  it("les accusés ne font qu'avancer l'état d'un message", async () => {
    const [intro] = await messagesOf(plume);
    const wamid = intro?.external_ref ?? "";
    await deliverWebhook(statusBody(wamid, "delivered"));
    await deliverWebhook(statusBody(wamid, "read"));
    // Arrivé en retard et dans le désordre : ignoré.
    await deliverWebhook(statusBody(wamid, "sent"));
    await deliverWebhook(statusBody(wamid, "failed", [{ code: 131026 }]));
    const { rows } = await admin.query(
      `SELECT delivery_status, delivered_at IS NOT NULL AS delivered, read_at IS NOT NULL AS read
       FROM messages WHERE id = $1`,
      [intro?.id],
    );
    expect(rows[0]).toEqual({
      delivery_status: "read",
      delivered: true,
      read: true,
    });
  });

  it("fenêtre fermée : le message du vétérinaire attend, une invitation part, puis il part à la réponse", async () => {
    // Dernier message du propriétaire il y a 25 h, chez Meta comme en base.
    meta.userWrites(OWNER_PHONE, new Date(Date.now() - 25 * 3_600_000));
    await admin.query(
      `UPDATE messages SET occurred_at = now() - interval '25 hours'
       WHERE followup_id = $1 AND direction = 'inbound'`,
      [plume],
    );
    const before = meta.sent.length;
    const text = "Pouvez-vous m'envoyer une photo de la plaie ?";
    const { messageId } = await conversations.writeToOwner(
      await actor(ids.vet),
      plume,
      text,
    );
    await drain(plume);
    const held = (await messagesOf(plume)).find(
      (message) => message.id === messageId,
    );
    expect(held?.delivery_status).toBe("awaiting_reply");
    const invites = meta.sent.slice(before);
    expect(invites).toHaveLength(1);
    expect(invites[0]).toMatchObject({
      type: "template",
      template: "message_en_attente",
    });
    expect(invites[0]?.body).not.toContain("photo");

    await ownerWrites("Oui je suis là");
    await drain(plume);
    const released = (await messagesOf(plume)).find(
      (message) => message.id === messageId,
    );
    expect(released?.delivery_status).toBe("sent");
    expect(
      meta.sent.filter((send) => send.type === "text").at(-1),
    ).toMatchObject({ body: text, reference: messageId });
  });

  it("échec signalé après coup : message en échec, tâche en échec, e-mail sans contenu au vétérinaire", async () => {
    const text = "La cicatrice est-elle toujours rouge ?";
    const { messageId } = await conversations.writeToOwner(
      await actor(ids.vet),
      plume,
      text,
    );
    await drain(plume);
    const sent = (await messagesOf(plume)).find(
      (message) => message.id === messageId,
    );
    expect(sent?.delivery_status).toBe("sent");
    await deliverWebhook(
      statusBody(sent?.external_ref ?? "", "failed", [{ code: 131026 }]),
    );
    const failed = (await messagesOf(plume)).find(
      (message) => message.id === messageId,
    );
    expect(failed).toMatchObject({
      delivery_status: "failed",
      error_code: "whatsapp_unreachable",
    });
    const { rows: jobs } = await admin.query(
      `SELECT status, last_error_code FROM scheduled_jobs
       WHERE kind = $1 AND payload ->> 'messageId' = $2`,
      [SEND_JOB, messageId],
    );
    expect(jobs).toEqual([
      { status: "dead", last_error_code: "recipient_unreachable" },
    ]);

    await drain(plume);
    const { rows: notices } = await admin.query(
      "SELECT status FROM scheduled_jobs WHERE kind = $1 AND followup_id = $2",
      [FAILURE_EMAIL_JOB, plume],
    );
    expect(notices).toEqual([{ status: "succeeded" }]);
    expect(emails).toHaveLength(1);
    const [email] = emails;
    expect(email?.to).toBe(`wv-${tag}@essai.test`);
    expect(email?.text).toContain(`/app/suivis/${plume}`);
    for (const secret of [
      "Margaux",
      "Plume",
      "cicatrice",
      OWNER_PHONE,
      OWNER_PHONE.slice(-8),
    ]) {
      expect(email?.text).not.toContain(secret);
      expect(email?.html).not.toContain(secret);
      expect(email?.subject).not.toContain(secret);
    }
  });

  it("numéro injoignable à l'envoi : abandon immédiat, sans nouvelle tentative", async () => {
    meta.nextUnreachable();
    const before = meta.sent.length;
    const { messageId } = await conversations.writeToOwner(
      await actor(ids.vet),
      plume,
      "Tout va bien de votre côté ?",
    );
    await drain(plume);
    expect(meta.sent.length).toBe(before);
    const failed = (await messagesOf(plume)).find(
      (message) => message.id === messageId,
    );
    expect(failed).toMatchObject({
      delivery_status: "failed",
      error_code: "whatsapp_unreachable",
    });
    const { rows } = await admin.query(
      `SELECT status, attempts FROM scheduled_jobs
       WHERE kind = $1 AND payload ->> 'messageId' = $2`,
      [SEND_JOB, messageId],
    );
    expect(rows).toEqual([{ status: "dead", attempts: 1 }]);
  });
});

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82,
]);
const OGG = new TextEncoder().encode("OggS\0\u0002vocal fictif de test");

/** Le propriétaire envoie un fichier depuis WhatsApp : Meta le garde, puis le webhook. */
async function ownerSends(
  type: "image" | "audio" | "video",
  media: Record<string, string>,
  wamid = `wamid.IN${randomUUID()}`,
) {
  meta.userWrites(OWNER_PHONE);
  const body = webhookBody({
    messages: [
      {
        from: OWNER_PHONE.slice(1),
        id: wamid,
        timestamp: seconds(),
        type,
        [type]: media,
      },
    ],
  });
  return { body, result: await deliverWebhook(body) };
}

async function lastInbound() {
  const inbound = (await messagesOf(plume)).filter(
    (message) => message.direction === "inbound",
  );
  return inbound.at(-1);
}

async function attachmentOf(messageId: string | undefined) {
  const { rows } = await admin.query(
    `SELECT id, kind, content_type, byte_size, storage_key FROM attachments
     WHERE message_id = $1`,
    [messageId],
  );
  return rows[0] as
    | {
        id: string;
        kind: string;
        content_type: string;
        byte_size: number;
        storage_key: string;
      }
    | undefined;
}

async function refusals() {
  const { rows } = await admin.query(
    `SELECT metadata FROM audit_events
     WHERE organization_id = $1 AND action = 'whatsapp.media_refused'
     ORDER BY occurred_at`,
    [org],
  );
  return rows.map((row: { metadata: unknown }) => row.metadata);
}

describe("photos et vocaux reçus par WhatsApp", () => {
  beforeAll(async () => {
    // Le vétérinaire rend la main à Numa après ses messages.
    await conversations.resumeNuma(await actor(ids.vet), plume);
    await drain(plume);
  });

  it("une photo est téléchargée chez Meta, déposée en privé, et Numa accuse réception", async () => {
    const mediaId = meta.addMedia(PNG, "image/png");
    const { body, result } = await ownerSends("image", {
      id: mediaId,
      mime_type: "image/png",
    });
    expect(result).toEqual({ messages: 1, statuses: 0, ignored: 0 });
    // Rejoué : ni second message ni second téléchargement.
    await deliverWebhook(body);
    const message = await lastInbound();
    const { rows: jobs } = await admin.query(
      "SELECT payload FROM scheduled_jobs WHERE kind = $1 AND followup_id = $2",
      [MEDIA_JOB, plume],
    );
    // Seuls des identifiants dans la tâche.
    expect(jobs).toEqual([
      { payload: { messageId: message?.id, mediaId, kind: "photo" } },
    ]);

    await drain(plume);
    const attachment = await attachmentOf(message?.id);
    expect(attachment).toMatchObject({
      kind: "photo",
      content_type: "image/png",
      byte_size: PNG.length,
    });
    expect(storage.keys()).toContain(attachment?.storage_key);
    expect(meta.downloads.filter((d) => d.mediaId === mediaId)).toHaveLength(1);
    expect(meta.sent.at(-1)?.body).toContain(
      "la photo de Plume est bien arrivée",
    );
  });

  it("un vocal est téléchargé puis transcrit", async () => {
    const mediaId = meta.addMedia(OGG, "audio/ogg; codecs=opus");
    await ownerSends("audio", { id: mediaId, mime_type: "audio/ogg" });
    await drain(plume);
    const message = await lastInbound();
    const attachment = await attachmentOf(message?.id);
    expect(attachment).toMatchObject({
      kind: "voice",
      content_type: "audio/ogg",
    });
    const { rows } = await admin.query(
      "SELECT 1 FROM voice_transcripts WHERE attachment_id = $1",
      [attachment?.id],
    );
    expect(rows).toHaveLength(1);
  });

  it("trop lourd, mauvais type, vidéo ou expiré : refusé, tracé sans contenu, et Numa le dit", async () => {
    const before = meta.sent.length;
    const keys = storage.keys().length;
    const big = new Uint8Array(6 * 1024 * 1024);
    big.set([0xff, 0xd8, 0xff]);
    const heavy = meta.addMedia(big, "image/jpeg");
    await ownerSends("image", { id: heavy, caption: "Regardez sa cicatrice" });
    await drain(plume);
    // Refusé sur la taille annoncée : rien n'a été téléchargé.
    expect(meta.downloads.filter((d) => d.mediaId === heavy)).toEqual([]);

    const html = meta.addMedia(
      new TextEncoder().encode("<svg onload=alert(1)>"),
      "image/png",
    );
    await ownerSends("image", { id: html });
    await drain(plume);

    await ownerSends("video", { id: "1234567", caption: "" });
    await drain(plume);

    const expired = meta.addMedia(PNG, "image/png");
    meta.expireMedia(expired);
    await ownerSends("image", { id: expired });
    await drain(plume);

    expect(await refusals()).toEqual([
      { kind: "photo", reason: "too_large" },
      { kind: "photo", reason: "file_type" },
      { kind: "other", reason: "file_type" },
      { kind: "photo", reason: "expired" },
    ]);
    expect(storage.keys()).toHaveLength(keys);
    // L'équipe voit chaque refus ; la légende reste le message du propriétaire.
    const { rows: notes } = await admin.query(
      `SELECT note_names FROM messages WHERE followup_id = $1 AND note_code = 'file_refused'`,
      [plume],
    );
    expect(notes).toHaveLength(4);
    expect(notes[0]).toEqual({ note_names: ["Margaux"] });
    const replies = meta.sent.slice(before);
    expect(replies).toHaveLength(4);
    for (const reply of replies)
      expect(reply.body).toContain("je n'ai pas pu recevoir ce fichier");
    const { rows: failed } = await admin.query(
      "SELECT status FROM scheduled_jobs WHERE kind = $1 AND followup_id = $2 AND status <> 'succeeded'",
      [MEDIA_JOB, plume],
    );
    expect(failed).toEqual([]);
  });

  it("Meta indisponible jusqu'au bout : la tâche passe en échec et le fichier est refusé", async () => {
    const mediaId = meta.addMedia(PNG, "image/png");
    await ownerSends("image", { id: mediaId });
    const message = await lastInbound();
    // Compte déconnecté entre-temps : plus aucun téléchargement possible.
    await admin.query(
      "DELETE FROM whatsapp_accounts WHERE organization_id = $1",
      [org],
    );
    await drain(plume);
    const { rows } = await admin.query(
      `SELECT status, last_error_code FROM scheduled_jobs
       WHERE kind = $1 AND payload ->> 'messageId' = $2`,
      [MEDIA_JOB, message?.id],
    );
    expect(rows).toEqual([
      { status: "dead", last_error_code: "provider_account" },
    ]);
    expect(await attachmentOf(message?.id)).toBeUndefined();
    expect((await refusals()).at(-1)).toEqual({
      kind: "photo",
      reason: "unavailable",
    });
  });
});
