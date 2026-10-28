import { randomInt, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createOrganization } from "../../db/seed/cabinets-fictifs";
import { createFakeDrVeto } from "@/adapters/drveto/fake";
import { fakePaymentMandate } from "@/adapters/payments/fake";
import { DomainError } from "@/domains/commun/actor";
import type { Actor } from "@/domains/commun/actor";
import { isPermissionKey } from "@/domains/equipe/permissions";
import { protocolsService } from "@/domains/protocoles/service";
import { settingsService } from "@/domains/reglages/service";
import {
  OPTIN_CODE_MINUTES,
  createOptInCode,
  optInCodeIn,
  optInService,
} from "@/domains/suivis/accord-qr";
import { launchService } from "@/domains/suivis/lancement";
import { handleWebhook, webhookPayload } from "@/domains/whatsapp/webhook";

import { pools } from "./support/db";

/**
 * Accord WhatsApp par QR code à l'accueil (ADR 0051) : le message prêt, envoyé depuis le numéro
 * de la fiche avec un code en cours, note l'accord au nom du membre qui a montré le QR code.
 * Tout autre envoi (autre numéro, code échu, remplacé, déjà servi, autre cabinet) ne note rien.
 */

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

const NOW = new Date("2026-10-07T12:00:00Z");
const drveto = createFakeDrVeto(() => NOW);
const launch = launchService({ db: appDb, drveto });
const settings = settingsService({
  db: appDb,
  whatsapp: { live: false },
  drveto,
  payments: fakePaymentMandate,
});
const protocols = protocolsService(appDb);
const simulated = optInService({ db: appDb, live: false });
const live = optInService({ db: appDb, live: true });

const org = randomUUID();
const other = randomUUID();
const tag = org.slice(0, 8);
const digits = (length: number) =>
  Array.from({ length }, (_, index) => randomInt(index === 0 ? 1 : 0, 10)).join(
    "",
  );
const PHONE_NUMBER_ID = digits(15);
const OTHER_PHONE_NUMBER_ID = digits(15);
/** Numéros fictifs des propriétaires de dr.veto simulé. */
const MARGAUX = "33639980101";
const ANTOINE = "33639980102";
const CHLOE = "33639980103";
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

/** Brouillon préparé par l'assistante pour Léo, sans accord noté. */
async function prepared(ref: string, organizationId = org, preparer?: string) {
  const who = await actor(preparer ?? ids.assistant, organizationId);
  const id = await launch.prepare(who, ref);
  const sheet = await launch.sheet(who, id);
  await launch.save(
    who,
    id,
    {
      firstContactHours: sheet.followup.firstContactHours,
      controlAppointmentAt: sheet.followup.controlAppointmentAt,
      steps: sheet.steps.map(({ offsetHours, kind, content }) => ({
        offsetHours,
        kind,
        content,
      })),
      alerts: sheet.alerts,
      validateTreatmentIds: [],
      removeTreatmentIds: [],
      addTreatments: [],
      ...(preparer ? {} : { responsibleMembershipId: ids.vet }),
      secondContactActive: sheet.contacts.some((c) => c.role === "secondary")
        ? true
        : undefined,
    },
    { launch: false },
    NOW,
  );
  return id;
}

let sequence = 0;
/** Message texte tel que Meta le relaie au numéro d'un cabinet. */
function inbound(
  from: string | null,
  body: string,
  phoneNumberId = PHONE_NUMBER_ID,
) {
  sequence += 1;
  return handleWebhook(
    appDb,
    webhookPayload.parse({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { phone_number_id: phoneNumberId },
                messages: [
                  {
                    id: `wamid.accord-${tag}-${sequence}`,
                    ...(from ? { from } : { from_user_id: "FR.1234567890" }),
                    timestamp: String(Math.floor(NOW.getTime() / 1000)),
                    type: "text",
                    text: { body },
                  },
                ],
              },
            },
          ],
        },
      ],
    }),
    NOW,
  );
}

async function optIns(followupId: string) {
  const { rows } = await admin.query(
    `SELECT c.role, c.whatsapp_optin_at, c.whatsapp_optin_by_membership_id AS by,
            c.optin_code_hash
     FROM followup_contacts c WHERE c.followup_id = $1 ORDER BY c.role`,
    [followupId],
  );
  return rows as {
    role: string;
    whatsapp_optin_at: Date | null;
    by: string | null;
    optin_code_hash: string | null;
  }[];
}

let plume: string;
let gaston: string;

beforeAll(async () => {
  const [adminId, vet, assistant] = await createOrganization(
    appDb,
    org,
    "Clinique d'essai du QR code",
    [
      {
        email: `qa-${tag}@essai.test`,
        displayName: "Dr Lou Admin",
        role: "admin_vet",
      },
      { email: `qv-${tag}@essai.test`, displayName: "Dr Léo Vet", role: "vet" },
      {
        email: `qs-${tag}@essai.test`,
        displayName: "Lina Asv",
        role: "assistant",
      },
    ],
  );
  const [outsider] = await createOrganization(appDb, other, "Autre cabinet", [
    {
      email: `qo-${tag}@essai.test`,
      displayName: "Dr Olga Autre",
      role: "admin_vet",
    },
  ]);
  if (!adminId || !vet || !assistant || !outsider) throw new Error("cabinet");
  ids = { admin: adminId, vet, assistant, outsider };
  for (const permission of ["followups.launch", "clinical.read"])
    await admin.query(
      "INSERT INTO membership_permissions (organization_id, membership_id, permission) VALUES ($1, $2, $3)",
      [org, assistant, permission],
    );
  for (const [organizationId, membership] of [
    [org, adminId],
    [other, outsider],
  ] as const) {
    const lead = await actor(membership, organizationId);
    for (const key of ["sterilisation-chatte", "detartrage"]) {
      const id = await protocols.installFromLibrary(lead, key);
      await protocols.validate(lead, id);
    }
    await settings.connect(lead, "drveto", "ESSAI-02");
  }
  // Numéros WhatsApp Business des deux cabinets, pour l'aiguillage des webhooks.
  for (const [organizationId, membership, phoneNumberId, phone] of [
    [org, adminId, PHONE_NUMBER_ID, "+33159000001"],
    [other, outsider, OTHER_PHONE_NUMBER_ID, "+33159000002"],
  ] as const)
    await admin.query(
      `INSERT INTO whatsapp_accounts
         (organization_id, waba_id, phone_number_id, access_token_sealed,
          connected_by_membership_id, display_phone)
       VALUES ($1, $2, $3, 'v1.essai.scelle', $4, $5)`,
      [organizationId, digits(15), phoneNumberId, membership, phone],
    );
  plume = await prepared("DV-20481");
  gaston = await prepared("DV-20517");
});

describe("code d'accord", () => {
  it("se lit dans le message, en majuscules ou non, et jamais sans son préfixe", () => {
    const code = createOptInCode();
    expect(code).toMatch(/^ACCORD-[A-HJKMNP-Z2-9]{8}$/);
    expect(optInCodeIn(`Bonjour, j'accepte. Code ${code}`)).toBe(code);
    expect(optInCodeIn(`code ${code.toLowerCase()} merci`)).toBe(code);
    expect(optInCodeIn("Code ACCORD-ABC")).toBeNull();
    expect(optInCodeIn("ABCDEFGH")).toBeNull();
    expect(optInCodeIn("Code ACCORD-ABCDEFGHJ")).toBeNull();
  });
});

describe("QR code de l'accueil", () => {
  it("un code par contact sans accord, valable une heure, jamais gardé en clair", async () => {
    const lina = await actor(ids.assistant);
    const codes = await simulated.issueCodes(lina, gaston, NOW);
    expect(codes).toHaveLength(2);
    for (const item of codes) {
      expect(item.link).toBeNull();
      expect(item.message).toContain("Clinique d'essai du QR code");
      expect(item.message).toContain(item.code);
      expect(item.expiresAt).toEqual(
        new Date(NOW.getTime() + OPTIN_CODE_MINUTES * 60_000),
      );
    }
    const { rows } = await admin.query(
      "SELECT optin_code_hash FROM followup_contacts WHERE followup_id = $1",
      [gaston],
    );
    const stored = JSON.stringify(rows);
    for (const item of codes) expect(stored).not.toContain(item.code);
    expect((await simulated.status(lina, gaston)).contacts).toEqual([
      expect.objectContaining({ role: "primary", optedIn: false }),
      expect.objectContaining({ role: "secondary", optedIn: false }),
    ]);
  });

  it("en WhatsApp réel, le QR code ouvre la conversation avec le numéro du cabinet", async () => {
    const [item] = await live.issueCodes(
      await actor(ids.assistant),
      plume,
      NOW,
    );
    expect(item?.link).toBe(
      `https://wa.me/33159000001?text=${encodeURIComponent(item?.message ?? "")}`,
    );
  });

  it("depuis le bon numéro, l'accord est noté au nom du membre qui l'a montré, une seule fois", async () => {
    const [code] = await simulated.issueCodes(
      await actor(ids.assistant),
      plume,
      NOW,
    );
    if (!code) throw new Error("code");
    // Autre numéro, ou identifiant WhatsApp sans numéro : rien n'est noté.
    expect(await inbound(ANTOINE, code.message)).toMatchObject({ optIns: 0 });
    expect(await inbound(null, code.message)).toMatchObject({ optIns: 0 });
    // Le code d'un cabinet envoyé au numéro d'un autre ne trouve rien.
    expect(
      await inbound(MARGAUX, code.message, OTHER_PHONE_NUMBER_ID),
    ).toMatchObject({ optIns: 0 });
    expect((await optIns(plume))[0]?.whatsapp_optin_at).toBeNull();

    expect(await inbound(MARGAUX, code.message)).toEqual({
      messages: 0,
      statuses: 0,
      acknowledgements: 0,
      optIns: 1,
      ignored: 0,
    });
    const [row] = await optIns(plume);
    expect(row).toMatchObject({ by: ids.assistant, optin_code_hash: null });
    expect(row?.whatsapp_optin_at).toEqual(NOW);
    // Aucun message gardé : rien n'est encore à suivre.
    const { rows: messages } = await admin.query(
      "SELECT 1 FROM messages WHERE followup_id = $1",
      [plume],
    );
    expect(messages).toEqual([]);
    const { rows: audit } = await admin.query(
      `SELECT actor_membership_id FROM audit_events
       WHERE organization_id = $1 AND action = 'followup.whatsapp_optin_qr' AND target_id = $2`,
      [org, plume],
    );
    expect(audit).toEqual([{ actor_membership_id: ids.assistant }]);

    // Déjà servi : renvoyé, il ne note rien de plus.
    expect(await inbound(MARGAUX, code.message)).toMatchObject({ optIns: 0 });
    const queue = await launch.readyQueue(await actor(ids.vet));
    expect(queue.find((d) => d.id === plume)?.blocker).not.toBe(
      "optin_missing",
    );
  });

  it("un code remplacé ou échu ne sert plus", async () => {
    const lina = await actor(ids.assistant);
    const first = await simulated.issueCodes(lina, gaston, NOW);
    const second = await simulated.issueCodes(lina, gaston, NOW);
    // Chaque message part des deux numéros : aucun ne doit compter.
    const sendAll = async (codes: typeof first) => {
      for (const item of codes)
        for (const from of [ANTOINE, CHLOE])
          expect(await inbound(from, item.message)).toMatchObject({
            optIns: 0,
          });
    };
    await sendAll(first);
    await admin.query(
      "UPDATE followup_contacts SET optin_code_expires_at = $2 WHERE followup_id = $1 AND optin_code_hash IS NOT NULL",
      [gaston, NOW],
    );
    await sendAll(second);
    expect((await optIns(gaston)).every((c) => !c.whatsapp_optin_at)).toBe(
      true,
    );
  });

  it("en simulation, le bouton suit le même chemin ; les deux accords libèrent le lancement", async () => {
    const lina = await actor(ids.assistant);
    const codes = await simulated.issueCodes(lina, gaston, NOW);
    const contacts = (await simulated.status(lina, gaston)).contacts;
    for (const item of codes)
      expect(await simulated.simulateScan(lina, gaston, item.code, NOW)).toBe(
        true,
      );
    expect(
      await simulated.simulateScan(lina, gaston, codes[0]?.code ?? "", NOW),
    ).toBe(false);
    expect((await simulated.status(lina, gaston)).contacts).toEqual(
      contacts.map((c) => ({ ...c, optedIn: true })),
    );
    expect(
      await domainError(live.simulateScan(lina, gaston, "ACCORD-ABCDEFGH")),
    ).toBe("invalid_target");
  });

  it("réservé à qui prépare le brouillon de ce cabinet", async () => {
    const draft = await prepared("DV-20612");
    expect(
      await domainError(
        simulated.issueCodes(await actor(ids.outsider, other), draft, NOW),
      ),
    ).toBe("not_found");
    // Sans la permission de lancer, l'écran n'existe pas (même réponse qu'un dossier inconnu).
    await admin.query(
      "DELETE FROM membership_permissions WHERE membership_id = $1 AND permission = 'followups.launch'",
      [ids.assistant],
    );
    expect(
      await domainError(
        simulated.issueCodes(await actor(ids.assistant), draft, NOW),
      ),
    ).toBe("not_found");
    await admin.query(
      "INSERT INTO membership_permissions (organization_id, membership_id, permission) VALUES ($1, $2, 'followups.launch')",
      [org, ids.assistant],
    );
  });

  it("sans numéro public connu en WhatsApp réel, pas de QR code", async () => {
    const draft = await prepared("DV-20627", other, ids.outsider);
    await admin.query(
      "UPDATE whatsapp_accounts SET display_phone = NULL WHERE organization_id = $1",
      [other],
    );
    expect(
      await domainError(
        live.issueCodes(await actor(ids.outsider, other), draft, NOW),
      ),
    ).toBe("integration_missing");
  });

  it("la base refuse un code incomplet ou en clair", async () => {
    const [contact] = await optIns(gaston);
    expect(contact).toBeDefined();
    await expect(
      admin.query(
        "UPDATE followup_contacts SET optin_code_hash = 'ACCORD-ABCDEFGH', optin_code_expires_at = now(), optin_code_by_membership_id = $2 WHERE followup_id = $1",
        [gaston, ids.assistant],
      ),
    ).rejects.toThrow(/check/);
    await expect(
      admin.query(
        "UPDATE followup_contacts SET optin_code_hash = repeat('a', 64) WHERE followup_id = $1",
        [plume],
      ),
    ).rejects.toThrow(/optin_code_complete/);
  });
});
