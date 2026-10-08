import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createOrganization } from "../../db/seed/cabinets-fictifs";
import { fakeAiGateway } from "@/adapters/ai-gateway/fake";
import { createFakeDrVeto } from "@/adapters/drveto/fake";
import { fakePaymentMandate } from "@/adapters/payments/fake";
import { fakeWhatsApp } from "@/adapters/whatsapp/fake";
import type { WhatsAppConnector } from "@/adapters/whatsapp/types";
import {
  conversationHandlers,
  conversationsService,
} from "@/domains/conversations/service";
import { DomainError } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import { isPermissionKey } from "@/domains/equipe/permissions";
import { protocolsService } from "@/domains/protocoles/service";
import { settingsService } from "@/domains/reglages/service";
import { launchService } from "@/domains/suivis/lancement";
import { createWorker } from "@/domains/taches/worker";
import { users } from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";

import { pools } from "./support/db";

/**
 * Langues (lot 19, ADR 0022) : langue de l'interface par personne, langue de Numa reconnue
 * dans les messages du propriétaire et corrigeable par un vétérinaire, motifs de triage et
 * traces de groupe codés pour être lus dans la langue de chacun.
 */

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

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

const sent: string[] = [];
const whatsapp: WhatsAppConnector = {
  ...fakeWhatsApp,
  async sendMessage(input) {
    sent.push(input.body);
    return fakeWhatsApp.sendMessage(input);
  },
};
const handlers = conversationHandlers({ whatsapp, ai: fakeAiGateway });
const worker = createWorker({
  db: appDb,
  workerId: "test-langue",
  handlers: {
    "followup.message": async (context) => {
      const handler = handlers["followup.message"];
      if (handler && context.job.organizationId === org) await handler(context);
    },
  },
});

const org = randomUUID();
const tag = org.slice(0, 8);
let ids: { admin: string; vet: string; assistant: string };

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

async function sqlState(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    const cause = (error as { cause?: { code?: string }; code?: string }).cause;
    return cause?.code ?? (error as { code?: string }).code ?? "inconnu";
  }
}

let followupId: string;

async function runDue() {
  await conversations.makeDueNow(await actor(ids.vet), followupId);
  await worker.runOnce();
}

const owner = (body: string) =>
  conversations.receiveOwnerMessage(org, followupId, body, "primary");

async function primaryLanguage() {
  const { rows } = await admin.query(
    `SELECT language, language_source FROM followup_contacts
     WHERE followup_id = $1 AND role = 'primary'`,
    [followupId],
  );
  return rows[0] as { language: string; language_source: string };
}

beforeAll(async () => {
  const [adminId, vet, assistant] = await createOrganization(
    appDb,
    org,
    "Clinique d'essai des langues",
    [
      {
        email: `la-${tag}@essai.test`,
        displayName: "Dr Ada Admin",
        role: "admin_vet",
      },
      { email: `lv-${tag}@essai.test`, displayName: "Dr Max Vet", role: "vet" },
      {
        email: `ls-${tag}@essai.test`,
        displayName: "Inès Assistante",
        role: "assistant",
      },
    ],
  );
  if (!adminId || !vet || !assistant) throw new Error("cabinet");
  ids = { admin: adminId, vet, assistant };
  const ada = await actor(adminId);
  await settings.connect(ada, "drveto", "ESSAI-19");
  await settings.connect(ada, "whatsapp", "06 39 98 00 19");
  const protocol = await protocols.installFromLibrary(ada, "detartrage");
  await protocols.validate(ada, protocol);

  // Gaston (dossier importé en français), propriétaire principal seul.
  const max = await actor(vet);
  followupId = await launches.prepare(max, "DV-20517");
  let sheet = await launches.sheet(max, followupId);
  if (!sheet.protocol) {
    const option = sheet.protocolOptions[0];
    if (!option) throw new Error("aucun protocole");
    await launches.applyProtocol(max, followupId, option.protocolId);
    sheet = await launches.sheet(max, followupId);
  }
  const hoursSince = Math.ceil(
    (Date.now() - sheet.followup.procedureAt.getTime()) / 3_600_000,
  );
  await launches.save(
    max,
    followupId,
    {
      firstContactHours: hoursSince + 2,
      secondContactActive: false,
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
  await runDue();
  expect((await owner("Oui")).outcome).toBe("consent_given");
  await runDue();
});

describe("langue de l'interface, par personne", () => {
  it("chacun choisit la sienne ; la base refuse de changer celle d'un collègue", async () => {
    const max = await actor(ids.vet);
    const ada = await actor(ids.admin);
    await withTenant(appDb, max, (tx) =>
      tx.update(users).set({ uiLocale: "en" }).where(eq(users.id, max.userId)),
    );
    expect(
      await sqlState(
        withTenant(appDb, max, (tx) =>
          tx
            .update(users)
            .set({ uiLocale: "en" })
            .where(eq(users.id, ada.userId)),
        ),
      ),
    ).toBe("42501");
    const { rows } = await admin.query(
      `SELECT id, ui_locale FROM users WHERE id = ANY($1) ORDER BY ui_locale::text`,
      [[max.userId, ada.userId]],
    );
    expect(rows).toEqual([
      { id: max.userId, ui_locale: "en" },
      { id: ada.userId, ui_locale: "fr" },
    ]);
    expect(
      await sqlState(
        admin.query(`UPDATE users SET ui_locale = 'de' WHERE id = $1`, [
          max.userId,
        ]),
      ),
    ).toBe("22P02");
  });
});

describe("langue de Numa avec le propriétaire", () => {
  it("un mot-clé ou un message court ne change rien", async () => {
    await owner("Merci !");
    expect(await primaryLanguage()).toEqual({
      language: "fr",
      language_source: "import",
    });
  });

  it("un message clairement en anglais : Numa lui répond désormais en anglais", async () => {
    expect(
      (await owner("She is eating well today and she seems fine, thank you"))
        .outcome,
    ).toBe("reply");
    expect(await primaryLanguage()).toEqual({
      language: "en",
      language_source: "detected",
    });
    await runDue();
    expect(sent.at(-1)).toMatch(/^Thank you for the news about Gaston/);
    const { rows } = await admin.query(
      `SELECT actor_membership_id, metadata FROM audit_events
       WHERE target_id = $1 AND action = 'followup.owner_language_detected'`,
      [followupId],
    );
    expect(rows).toEqual([
      {
        actor_membership_id: null,
        metadata: { role: "primary", language: "en" },
      },
    ]);
  });

  it("seul un vétérinaire qui peut écrire au propriétaire corrige la langue", async () => {
    const ines = await actor(ids.assistant);
    expect(
      await domainError(
        conversations.setOwnerLanguage(ines, followupId, {
          role: "primary",
          language: "fr",
        }),
      ),
      "sans droit de répondre, l'écran n'existe pas pour elle",
    ).toBe("not_found");
    const max = await actor(ids.vet);
    expect(
      await domainError(
        conversations.setOwnerLanguage(max, followupId, {
          role: "primary",
          language: "de",
        }),
      ),
    ).toBe("invalid_target");
    expect(
      await domainError(
        conversations.setOwnerLanguage(max, followupId, {
          role: "secondary",
          language: "fr",
        }),
      ),
      "Chloé n'est pas un contact actif de ce suivi",
    ).toBe("invalid_target");
    await conversations.setOwnerLanguage(max, followupId, {
      role: "primary",
      language: "fr",
    });
    expect(await primaryLanguage()).toEqual({
      language: "fr",
      language_source: "vet",
    });
    const { rows } = await admin.query(
      `SELECT actor_membership_id, metadata FROM audit_events
       WHERE target_id = $1 AND action = 'followup.owner_language_changed'`,
      [followupId],
    );
    expect(rows).toEqual([
      {
        actor_membership_id: ids.vet,
        metadata: { role: "primary", language: "fr" },
      },
    ]);
  });

  it("le choix du cabinet prime ensuite sur la détection", async () => {
    await owner("He is sleeping a lot today, but he seems fine and well");
    expect(await primaryLanguage()).toEqual({
      language: "fr",
      language_source: "vet",
    });
    await runDue();
    expect(sent.at(-1)).toMatch(/^Merci pour ces nouvelles de Gaston/);
    const view = await conversations.view(await actor(ids.vet), followupId);
    expect(view.contacts[0]).toMatchObject({
      language: "fr",
      languageSource: "vet",
    });
  });
});

describe("motifs de triage codés", () => {
  it("un triage automatique garde son code ; la base refuse un code sur un triage écrit par un vétérinaire", async () => {
    await owner("Il respire mal depuis ce matin");
    const { rows } = await admin.query(
      `SELECT reason_code, reason FROM triage_events
       WHERE followup_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [followupId],
    );
    expect(rows[0]).toEqual({
      reason_code: "red_flag",
      reason: "Signal d'urgence reconnu dans le message du propriétaire.",
    });
    expect(
      await sqlState(
        admin.query(
          `INSERT INTO triage_events
             (organization_id, followup_id, level, source, reason, reason_code, created_by_membership_id)
           VALUES ($1, $2, 'watch', 'vet', 'Vu en consultation', 'concern', $3)`,
          [org, followupId, ids.vet],
        ),
      ),
    ).toBe("23514");
    // L'historique reste en ajout seul.
    expect(
      await sqlState(
        admin.query(
          `UPDATE triage_events SET reason_code = 'none' WHERE followup_id = $1`,
          [followupId],
        ),
      ),
    ).not.toBeNull();
  });

  it("une trace codée n'appartient qu'à un message du système", async () => {
    expect(
      await sqlState(
        admin.query(
          `UPDATE messages SET note_code = 'left_group'
           WHERE followup_id = $1 AND author = 'owner'`,
          [followupId],
        ),
      ),
    ).toBe("23514");
  });
});
