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
import type { SheetInput } from "@/domains/suivis/plan";

import { pools } from "./support/db";

/**
 * File « Prêts à lancer » (ADR 0046) : l'assistante prépare, seul le vétérinaire responsable
 * lance ; les traitements importés qu'il a relus sont validés du même geste, et rien n'est
 * fait si la fiche a changé entre-temps. Chaque cabinet ne voit que ses brouillons.
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

/** Fiche telle que l'écran la renverrait, avec des modifications ciblées. */
async function sheetInputOf(
  who: Actor,
  followupId: string,
  patch: Partial<SheetInput> = {},
): Promise<SheetInput> {
  const sheet = await service.sheet(who, followupId);
  return {
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
    ...patch,
  };
}

/** L'assistante prépare la fiche pour Léo, accord WhatsApp noté ou non à l'accueil. */
async function preparedForLeo(ref: string, optIn: boolean) {
  const lina = await actor(ids.assistant);
  const id = await service.prepare(lina, ref);
  await service.save(
    lina,
    id,
    await sheetInputOf(lina, id, { responsibleMembershipId: ids.vet }),
    { launch: false },
    NOW,
  );
  await service.save(
    lina,
    id,
    await sheetInputOf(lina, id, { whatsappOptIn: optIn }),
    { launch: false },
    NOW,
  );
  return id;
}

async function status(followupId: string) {
  const { rows } = await admin.query(
    "SELECT status FROM followups WHERE id = $1",
    [followupId],
  );
  return (rows[0] as { status: string } | undefined)?.status;
}

let plume: string;
let gaston: string;

beforeAll(async () => {
  const [adminId, vet, assistant] = await createOrganization(
    appDb,
    org,
    "Clinique d'essai des prêts à lancer",
    [
      {
        email: `pa-${tag}@essai.test`,
        displayName: "Dr Lou Admin",
        role: "admin_vet",
      },
      { email: `pv-${tag}@essai.test`, displayName: "Dr Léo Vet", role: "vet" },
      {
        email: `ps-${tag}@essai.test`,
        displayName: "Lina Asv",
        role: "assistant",
      },
    ],
  );
  const [outsider] = await createOrganization(appDb, other, "Autre cabinet", [
    {
      email: `po-${tag}@essai.test`,
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
  const lou = await actor(adminId);
  for (const key of ["sterilisation-chatte", "detartrage"]) {
    const id = await protocols.installFromLibrary(lou, key);
    await protocols.validate(lou, id);
  }
  await settings.connect(lou, "drveto", "ESSAI-02");
  plume = await preparedForLeo("DV-20481", true);
  gaston = await preparedForLeo("DV-20517", false);
});

describe("prêts à lancer", () => {
  it("le responsable voit ses fiches avec ce qui manque et les traitements à valider", async () => {
    const leo = await actor(ids.vet);
    const before = await service.readyQueue(leo);
    expect(before.find((d) => d.id === plume)?.blocker).toBe(
      "integration_missing",
    );
    await settings.connect(
      await actor(ids.admin),
      "whatsapp",
      "06 39 98 00 01",
    );

    const queue = await service.readyQueue(leo);
    expect(queue.map((d) => [d.animalName, d.blocker, d.canLaunch])).toEqual(
      expect.arrayContaining([
        ["Plume", null, true],
        ["Gaston", "optin_missing", true],
      ]),
    );
    const card = queue.find((d) => d.id === plume);
    expect(card).toMatchObject({
      procedure: "Ovariectomie",
      protocolName: "Stérilisation de la chatte",
      responsibleName: "Dr Léo Vet",
    });
    expect(card?.treatments.map((t) => t.name)).toEqual([
      "Anti-inflammatoire (exemple fictif)",
    ]);
  });

  it("l'assistante et un autre vétérinaire voient la file sans pouvoir lancer", async () => {
    for (const who of [await actor(ids.assistant), await actor(ids.admin)]) {
      const queue = await service.readyQueue(who);
      expect(queue.map((d) => d.id).sort()).toEqual([plume, gaston].sort());
      expect(queue.every((d) => !d.canLaunch)).toBe(true);
      const card = queue.find((d) => d.id === plume);
      expect(
        await domainError(
          service.launchFromQueue(
            who,
            [
              {
                followupId: plume,
                treatmentIds: card?.treatments.map((t) => t.id) ?? [],
              },
            ],
            NOW,
          ),
        ),
      ).toBe("forbidden");
    }
    expect(await status(plume)).toBe("draft");
  });

  it("refuse si les traitements relus ne sont plus ceux de la fiche", async () => {
    const leo = await actor(ids.vet);
    expect(
      await domainError(
        service.launchFromQueue(
          leo,
          [{ followupId: plume, treatmentIds: [] }],
          NOW,
        ),
      ),
    ).toBe("sheet_changed");
    expect(
      await domainError(
        service.launchFromQueue(
          leo,
          [{ followupId: plume, treatmentIds: [randomUUID()] }],
          NOW,
        ),
      ),
    ).toBe("sheet_changed");
    expect(await status(plume)).toBe("draft");
  });

  it("un clic valide les traitements relus et lance ; le journal dit d'où", async () => {
    const leo = await actor(ids.vet);
    const card = (await service.readyQueue(leo)).find((d) => d.id === plume);
    const treatmentIds = card?.treatments.map((t) => t.id) ?? [];
    expect(
      await service.launchFromQueue(
        leo,
        [{ followupId: plume, treatmentIds }],
        NOW,
      ),
    ).toEqual({ launched: 1, failed: 0 });
    expect(await status(plume)).toBe("active");
    const sheet = await service.sheet(leo, plume);
    expect(sheet.treatments.map((t) => t.validatedBy)).toEqual(["Dr Léo Vet"]);
    const { rows } = await admin.query(
      `SELECT action, metadata FROM audit_events
       WHERE target_id = $1 AND action IN ('followup.launched', 'followup.treatments_validated')
       ORDER BY occurred_at, action`,
      [plume],
    );
    expect(rows).toEqual([
      {
        action: "followup.launched",
        metadata: expect.objectContaining({ via: "queue" }),
      },
      {
        action: "followup.treatments_validated",
        metadata: { count: 1, via: "queue" },
      },
    ]);
    expect((await service.readyQueue(leo)).map((d) => d.id)).not.toContain(
      plume,
    );
  });

  it("« Tout lancer » lance chaque fiche prête et compte celles qui ont changé", async () => {
    const lina = await actor(ids.assistant);
    await service.save(
      lina,
      gaston,
      await sheetInputOf(lina, gaston, { whatsappOptIn: true }),
      { launch: false },
      NOW,
    );
    const third = await preparedForLeo("DV-20598", true);
    const leo = await actor(ids.vet);
    const queue = await service.readyQueue(leo);
    const ids_ = (id: string) =>
      queue.find((d) => d.id === id)?.treatments.map((t) => t.id) ?? [];
    expect(ids_(gaston)).toHaveLength(2);
    expect(
      await service.launchFromQueue(
        leo,
        [
          { followupId: gaston, treatmentIds: ids_(gaston) },
          { followupId: third, treatmentIds: [randomUUID()] },
        ],
        NOW,
      ),
    ).toEqual({ launched: 1, failed: 1 });
    expect(await status(gaston)).toBe("active");
    expect(await status(third)).toBe("draft");
  });

  it("un autre cabinet ne voit ni ne lance aucun brouillon", async () => {
    const olga = await actor(ids.outsider, other);
    expect(await service.readyQueue(olga)).toEqual([]);
    expect(
      await domainError(
        service.launchFromQueue(
          olga,
          [{ followupId: gaston, treatmentIds: [] }],
          NOW,
        ),
      ),
    ).toBe("not_found");
  });

  it("refuse une demande mal formée", async () => {
    const leo = await actor(ids.vet);
    for (const input of [
      [],
      [{ followupId: "x", treatmentIds: [] }],
      Array.from({ length: 31 }, () => ({
        followupId: randomUUID(),
        treatmentIds: [],
      })),
    ])
      expect(await domainError(service.launchFromQueue(leo, input, NOW))).toBe(
        "invalid_target",
      );
  });
});
