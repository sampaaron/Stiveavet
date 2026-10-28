import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createOrganization } from "../../db/seed/cabinets-fictifs";
import { createFakeDrVeto } from "@/adapters/drveto/fake";
import { fakePaymentMandate } from "@/adapters/payments/fake";
import { DomainError } from "@/domains/commun/actor";
import type { Actor } from "@/domains/commun/actor";
import { isPermissionKey } from "@/domains/equipe/permissions";
import { protocolsService } from "@/domains/protocoles/service";
import { settingsService } from "@/domains/reglages/service";
import { launchService } from "@/domains/suivis/lancement";

import { pools } from "./support/db";

/**
 * Opérés du jour (ADR 0047) : les animaux opérés lus dans dr.veto, une fiche préparée en un
 * clic avec pour responsable le vétérinaire qui a opéré, l'accord WhatsApp noté depuis la vue
 * d'ensemble pour les seuls contacts qui écriront. Chaque cabinet ne voit que les siens.
 */

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

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

async function responsibleOf(followupId: string) {
  const { rows } = await admin.query(
    "SELECT responsible_membership_id AS id FROM followups WHERE id = $1",
    [followupId],
  );
  return (rows[0] as { id: string } | undefined)?.id;
}

async function draftOf(ref: string, who: Actor) {
  const operated = (await service.operatedToday(who, NOW)) ?? [];
  return operated.find((animal) => animal.ref === ref)?.followup ?? null;
}

const PRALINE = "DV-20598";
const BRINDILLE = "DV-20746";
const CALINE = "DV-20760";
const GASTON = "DV-20517";

beforeAll(async () => {
  const [adminId, vet, assistant] = await createOrganization(
    appDb,
    org,
    "Clinique d'essai des opérés du jour",
    [
      {
        email: `oa-${tag}@essai.test`,
        displayName: "Dr Claire Fontaine",
        role: "admin_vet",
      },
      { email: `ov-${tag}@essai.test`, displayName: "Dr Léo Vet", role: "vet" },
      {
        email: `os-${tag}@essai.test`,
        displayName: "Lina Asv",
        role: "assistant",
      },
    ],
  );
  const [outsider] = await createOrganization(appDb, other, "Autre cabinet", [
    {
      email: `oo-${tag}@essai.test`,
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
  const claire = await actor(adminId);
  for (const key of ["sterilisation-chatte", "detartrage"]) {
    const id = await protocols.installFromLibrary(claire, key);
    await protocols.validate(claire, id);
  }
});

describe("opérés du jour", () => {
  it("rien sans dr.veto ; ensuite les opérés du jour, sans suivi encore", async () => {
    const lina = await actor(ids.assistant);
    expect(await service.operatedToday(lina, NOW)).toBeNull();
    await settings.connect(await actor(ids.admin), "drveto", "ESSAI-03");
    await settings.connect(
      await actor(ids.admin),
      "whatsapp",
      "06 39 98 00 03",
    );
    const operated = (await service.operatedToday(lina, NOW)) ?? [];
    expect(operated.map((animal) => animal.name)).toEqual(
      expect.arrayContaining(["Praline", "Brindille", "Câline"]),
    );
    expect(operated.find((animal) => animal.ref === CALINE)).toMatchObject({
      practitionerName: "Dr Hugo Marchal",
      followup: null,
    });
    const times = operated.map((animal) => animal.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("le responsable est d'office le vétérinaire qui a opéré, s'il est de l'équipe", async () => {
    const lina = await actor(ids.assistant);
    const leo = await actor(ids.vet);
    expect(await service.prepareMany(lina, [BRINDILLE])).toBe(1);
    const brindille = await draftOf(BRINDILLE, lina);
    expect(brindille?.status).toBe("draft");
    // Opérée par Dr Claire Fontaine, du cabinet : c'est elle qui lancera.
    expect(await responsibleOf(brindille?.id ?? "")).toBe(ids.admin);
    // Léo ne voit que ses suivis : pas les opérés de Claire ; un praticien hors de
    // l'équipe, oui, et il devient responsable de la fiche qu'il prépare.
    const forLeo = (await service.operatedToday(leo, NOW)) ?? [];
    expect(forLeo.map((animal) => animal.ref)).not.toContain(PRALINE);
    expect(forLeo.map((animal) => animal.ref)).toContain(CALINE);
    expect(await service.prepareMany(leo, [CALINE])).toBe(1);
    expect(await responsibleOf((await draftOf(CALINE, leo))?.id ?? "")).toBe(
      ids.vet,
    );
    // Déjà suivis : rien n'est refait.
    expect(await service.prepareMany(lina, [BRINDILLE, CALINE])).toBe(0);
  });

  it("l'accord noté à l'accueil ne vaut que pour les contacts qui écriront", async () => {
    const lina = await actor(ids.assistant);
    expect(await service.prepareMany(lina, [GASTON])).toBe(1);
    const gaston = await draftOf(GASTON, lina);
    const before = await service.readyQueue(lina);
    expect(before.find((d) => d.id === gaston?.id)?.blocker).toBe(
      "optin_missing",
    );
    await service.recordOptIn(lina, gaston?.id ?? "", NOW);
    const { rows } = await admin.query(
      `SELECT role, whatsapp_optin_at IS NOT NULL AS opted, whatsapp_optin_by_membership_id AS by
       FROM followup_contacts WHERE followup_id = $1 ORDER BY role`,
      [gaston?.id],
    );
    expect(rows).toEqual([
      { role: "primary", opted: true, by: ids.assistant },
      { role: "secondary", opted: false, by: null },
    ]);
    const after = await service.readyQueue(lina);
    expect(after.find((d) => d.id === gaston?.id)?.blocker).toBeNull();
    const audit = await admin.query(
      `SELECT metadata FROM audit_events WHERE target_id = $1 AND action = 'followup.whatsapp_optin'`,
      [gaston?.id],
    );
    expect(audit.rows).toEqual([{ metadata: { given: true, via: "queue" } }]);
  });

  it("noter l'accord : seulement sur un brouillon, par qui prépare, dans son cabinet", async () => {
    const lina = await actor(ids.assistant);
    expect(await service.prepareMany(lina, [PRALINE])).toBe(1);
    const praline = await draftOf(PRALINE, lina);
    const plain: Actor = {
      ...lina,
      permissions: new Set(
        [...lina.permissions].filter((key) => key !== "followups.launch"),
      ),
    };
    expect(
      await domainError(service.recordOptIn(plain, praline?.id ?? "")),
    ).toBe("not_found");
    const olga = await actor(ids.outsider, other);
    expect(
      await domainError(service.recordOptIn(olga, praline?.id ?? "")),
    ).toBe("not_found");
    expect(await service.operatedToday(olga, NOW)).toBeNull();
    expect(await domainError(service.prepareMany(olga, [PRALINE]))).toBe(
      undefined,
    );
  });

  it("refuse une liste mal formée", async () => {
    const leo = await actor(ids.vet);
    for (const refs of [
      [],
      ["<script>"],
      Array.from({ length: 21 }, () => PRALINE),
    ])
      expect(await domainError(service.prepareMany(leo, refs))).toBe(
        "invalid_target",
      );
  });
});
