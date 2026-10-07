import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  SEED,
  createOrganization,
  insertFollowup,
} from "../../db/seed/cabinets-fictifs";
import { DomainError } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import { isPermissionKey } from "@/domains/equipe/permissions";
import type { ProtocolContent } from "@/domains/protocoles/content";
import { PROTOCOL_LIBRARY } from "@/domains/protocoles/library";
import { protocolsService } from "@/domains/protocoles/service";
import { followups as fixtureFollowups } from "@/fixtures/cabinet-tilleuls";
import { withTenant } from "@/server/db/tenant";

import { asApp, errorCode, pools } from "./support/db";

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

const service = protocolsService(appDb);

// Cabinet propre à ce fichier.
const org = randomUUID();
const tag = org.slice(0, 8);
let ids: { admin: string; vet1: string; vet2: string; assistant: string };

beforeAll(async () => {
  const [adminId, vet1, vet2, assistant] = await createOrganization(
    appDb,
    org,
    "Clinique d'essai des protocoles",
    [
      {
        email: `pa-${tag}@essai.test`,
        displayName: "Dr Pia Admin",
        role: "admin_vet",
      },
      {
        email: `pv1-${tag}@essai.test`,
        displayName: "Dr Paul Un",
        role: "vet",
      },
      {
        email: `pv2-${tag}@essai.test`,
        displayName: "Dr Pat Deux",
        role: "vet",
      },
      {
        email: `pas-${tag}@essai.test`,
        displayName: "Pam Asv",
        role: "assistant",
      },
    ],
  );
  if (!adminId || !vet1 || !vet2 || !assistant) throw new Error("cabinet");
  ids = { admin: adminId, vet1, vet2, assistant };
});

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

const content = (name: string): ProtocolContent => ({
  name,
  category: "surgery",
  species: "dog",
  description: "Protocole d'essai",
  durationDays: 10,
  steps: [
    { offsetHours: 24, kind: "question", content: "A-t-il mangé ?" },
    { offsetHours: 4, kind: "message", content: "Prendre des nouvelles." },
  ],
  alerts: [{ level: "urgent", description: "Saignement" }],
});

describe("bibliothèque de départ", () => {
  it("un administrateur ajoute un modèle, à valider par un vétérinaire, une seule fois", async () => {
    const pia = await actor(ids.admin);
    const before = await service.list(pia);
    expect(before.library).toHaveLength(PROTOCOL_LIBRARY.length);

    const id = await service.installFromLibrary(pia, "detartrage");
    const detail = await service.get(pia, id);
    expect(detail.fromLibrary).toBe(true);
    expect(detail.version.validatedAt).toBeNull();
    expect(detail.can.validate).toBe(true);
    expect(
      await domainError(service.installFromLibrary(pia, "detartrage")),
    ).toBe("already_installed");
    expect((await service.list(pia)).library.map((e) => e.key)).not.toContain(
      "detartrage",
    );

    await service.validate(pia, id);
    const validated = await service.get(pia, id);
    expect(validated.version.validatedByName).toBe("Dr Pia Admin");
  });

  it("un vétérinaire sans gestion des protocoles ne peut ni ajouter ni valider un protocole du cabinet", async () => {
    const paul = await actor(ids.vet1);
    expect(
      await domainError(service.installFromLibrary(paul, "castration-chien")),
    ).toBe("not_found");
    expect((await service.list(paul)).library).toEqual([]);
  });
});

describe("versions immuables", () => {
  it("modifier un protocole ne change aucun suivi lancé", async () => {
    const pia = await actor(ids.admin);
    const id = await service.create(
      pia,
      "cabinet",
      content("Chirurgie d'essai"),
    );
    const v1 = await service.get(pia, id);
    expect(v1.version.versionNumber).toBe(1);
    // Les étapes sont rangées dans l'ordre chronologique.
    expect(v1.version.content.steps.map((s) => s.offsetHours)).toEqual([4, 24]);
    // Écrit par un vétérinaire : la première version est validée par lui.
    expect(v1.version.validatedAt).not.toBeNull();

    const followupId = randomUUID();
    const fixture = fixtureFollowups[0];
    if (!fixture) throw new Error("fixtures");
    await withTenant(appDb, { organizationId: org }, (tx) =>
      insertFollowup(
        tx,
        org,
        ids.admin,
        { ...structuredClone(fixture), id: followupId },
        v1.version.id,
      ),
    );

    const changed = {
      ...content("Chirurgie d'essai"),
      durationDays: 14,
      alerts: [
        { level: "urgent" as const, description: "Saignement" },
        { level: "watch" as const, description: "Appétit diminué" },
      ],
    };
    expect(await service.update(pia, id, changed, "Ajout d'un signe")).toBe(2);

    const { rows } = await admin.query(
      "SELECT protocol_version_id FROM followups WHERE id = $1",
      [followupId],
    );
    expect(rows[0]?.protocol_version_id).toBe(v1.version.id);
    const old = await service.get(pia, id, 1);
    expect(old.isCurrent).toBe(false);
    expect(old.version.content.durationDays).toBe(10);
    expect(old.version.content.alerts).toHaveLength(1);
    expect(old.version.followupCount).toBe(1);
    const current = await service.get(pia, id);
    expect(current.version.content.alerts).toHaveLength(2);
    expect(current.versions.map((v) => v.versionNumber)).toEqual([2, 1]);

    // Un suivi lancé ne peut pas changer de version, même directement en base.
    expect(
      await errorCode(
        asApp(app, org, (client) =>
          client.query(
            "UPDATE followups SET protocol_version_id = $1 WHERE id = $2",
            [current.version.id, followupId],
          ),
        ),
      ),
    ).toBe("23514");
  });

  it("la base refuse toute modification ou suppression du contenu d'une version", async () => {
    const pia = await actor(ids.admin);
    const id = await service.create(pia, "cabinet", content("Protocole figé"));
    const { version } = await service.get(pia, id);
    const attempts = [
      [
        "UPDATE protocol_versions SET validated_at = now() WHERE id = $1",
        "23514",
      ],
      ["DELETE FROM protocol_versions WHERE id = $1", "42501"],
      [
        "UPDATE protocol_steps SET content = 'autre' WHERE protocol_version_id = $1",
        "42501",
      ],
      ["DELETE FROM alert_rules WHERE protocol_version_id = $1", "42501"],
    ] as const;
    for (const [query, code] of attempts)
      expect(
        await errorCode(
          asApp(app, org, (client) => client.query(query, [version.id])),
        ),
        query,
      ).toBe(code);

    // Même le propriétaire des tables (migrations) ne peut pas réécrire une version.
    expect(
      await errorCode(
        admin.query(
          "UPDATE protocol_steps SET content = 'autre' WHERE protocol_version_id = $1",
          [version.id],
        ),
      ),
    ).toBe("42501");
    expect(
      await errorCode(
        admin.query(
          "UPDATE protocol_versions SET name = 'autre' WHERE id = $1",
          [version.id],
        ),
      ),
    ).toBe("23514");
  });
});

describe("protocoles personnels et droits", () => {
  it("un vétérinaire crée et modifie ses propres protocoles, invisibles des confrères", async () => {
    const paul = await actor(ids.vet1);
    const pat = await actor(ids.vet2);
    const pia = await actor(ids.admin);
    const id = await service.create(paul, "personal", content("Mon protocole"));

    expect(
      await service.update(paul, id, content("Mon protocole v2"), ""),
    ).toBe(2);
    expect((await service.list(paul)).protocols.map((p) => p.id)).toContain(id);
    expect((await service.list(pat)).protocols.map((p) => p.id)).not.toContain(
      id,
    );
    expect(await domainError(service.get(pat, id))).toBe("not_found");
    // L'administrateur le voit (vue d'ensemble) sans pouvoir le modifier.
    const seen = await service.get(pia, id);
    expect(seen.ownerName).toBe("Dr Paul Un");
    expect(seen.can.edit).toBe(false);
    expect(await domainError(service.update(pia, id, content("x y"), ""))).toBe(
      "forbidden",
    );
    expect(
      await domainError(service.create(paul, "cabinet", content("Cab"))),
    ).toBe("not_found");
  });

  it("la copie d'un protocole reste à valider et garde son origine", async () => {
    const pia = await actor(ids.admin);
    const paul = await actor(ids.vet1);
    const source = await service.create(pia, "cabinet", content("Source"));
    const copy = await service.duplicate(paul, source, "personal");
    const detail = await service.get(paul, copy);
    expect(detail.version.content.name).toBe("Source (copie)");
    expect(detail.ownerMembershipId).toBe(ids.vet1);
    expect(detail.version.validatedAt).toBeNull();
    await service.validate(paul, copy);
    expect((await service.get(paul, copy)).version.validatedAt).not.toBeNull();
  });

  it("un assistant n'a pas accès aux protocoles par défaut", async () => {
    const pam = await actor(ids.assistant);
    expect(await domainError(service.list(pam))).toBe("not_found");
    expect(
      await domainError(service.create(pam, "personal", content("Asv"))),
    ).toBe("not_found");
  });

  it("un protocole archivé ne se modifie plus et se restaure", async () => {
    const pia = await actor(ids.admin);
    const id = await service.create(pia, "cabinet", content("À archiver"));
    await service.setArchived(pia, id, true);
    expect((await service.get(pia, id)).can.edit).toBe(false);
    expect(
      await domainError(service.update(pia, id, content("À archiver"), "")),
    ).toBe("invalid_target");
    await service.setArchived(pia, id, false);
    expect((await service.get(pia, id)).can.edit).toBe(true);
  });

  it("un contenu invalide est refusé avant toute écriture", async () => {
    const pia = await actor(ids.admin);
    expect(
      await domainError(
        service.create(pia, "cabinet", {
          ...content("Trop long"),
          durationDays: 1,
          steps: [
            { offsetHours: 48, kind: "question", content: "Après la fin" },
          ],
        }),
      ),
    ).toBe("invalid_target");
  });

  it("un autre cabinet ne voit jamais ces protocoles", async () => {
    const pia = await actor(ids.admin);
    const id = await service.create(pia, "cabinet", content("Isolé"));
    const { rows } = await admin.query(
      "SELECT m.id FROM memberships m WHERE m.organization_id = $1 AND m.role = 'admin_vet' LIMIT 1",
      [SEED.martin],
    );
    const martinId = (rows[0] as { id: string } | undefined)?.id;
    if (!martinId) throw new Error("seed");
    const martin = { ...(await actor(martinId)), organizationId: SEED.martin };
    expect(await domainError(service.get(martin, id))).toBe("not_found");
  });
});

describe("jeu fictif", () => {
  it("les suivis fictifs des Tilleuls sont rattachés à une version de protocole", async () => {
    const { rows } = await admin.query(
      "SELECT count(*)::int AS n FROM followups WHERE organization_id = $1 AND protocol_version_id IS NOT NULL",
      [SEED.tilleuls],
    );
    expect((rows[0] as { n: number }).n).toBeGreaterThan(0);
  });
});
