import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import {
  FICTIONAL_LOGIN_PHRASE,
  SEED,
  createOrganization,
  insertFollowup,
} from "../../db/seed/cabinets-fictifs";
import { MemoryEmailSender } from "@/adapters/email/memory";
import { hashPassword } from "@/domains/auth/password";
import { authService } from "@/domains/auth/service";
import { DomainError } from "@/domains/commun/actor";
import type { Actor } from "@/domains/commun/actor";
import { isPermissionKey } from "@/domains/equipe/permissions";
import {
  acceptInvitation,
  previewInvitation,
  teamService,
} from "@/domains/equipe/service";
import { followupsService } from "@/domains/suivis/service";
import { followups as fixtureFollowups } from "@/fixtures/cabinet-tilleuls";
import * as schema from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";

import { asApp, errorCode, pools } from "./support/db";

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

const mailbox = new MemoryEmailSender();
const team = teamService({
  db: appDb,
  email: mailbox,
  appUrl: "http://localhost:3000",
});
const suivis = followupsService(appDb);

// Cabinet propre à ce fichier : aucune modification des cabinets fictifs partagés.
const org = randomUUID();
const tag = org.slice(0, 8);
const emails = {
  admin: `admin-${tag}@essai.test`,
  vet1: `vet1-${tag}@essai.test`,
  vet2: `vet2-${tag}@essai.test`,
  assistant: `asv-${tag}@essai.test`,
};
let ids: { admin: string; vet1: string; vet2: string; assistant: string };
const followupIds = {
  adminCase: randomUUID(),
  vet1Case: randomUUID(),
  vet2Case: randomUUID(),
};

beforeAll(async () => {
  const [adminId, vet1, vet2, assistant] = await createOrganization(
    appDb,
    org,
    "Clinique d'essai des droits",
    [
      { email: emails.admin, displayName: "Dr Ada Admin", role: "admin_vet" },
      { email: emails.vet1, displayName: "Dr Victor Un", role: "vet" },
      { email: emails.vet2, displayName: "Dr Vera Deux", role: "vet" },
      { email: emails.assistant, displayName: "Alex Asv", role: "assistant" },
    ],
  );
  if (!adminId || !vet1 || !vet2 || !assistant) throw new Error("cabinet");
  ids = { admin: adminId, vet1, vet2, assistant };
  const [a, b, c] = fixtureFollowups;
  if (!a || !b || !c) throw new Error("fixtures");
  await withTenant(appDb, { organizationId: org }, async (tx) => {
    await insertFollowup(tx, org, ids.admin, {
      ...structuredClone(a),
      id: followupIds.adminCase,
    });
    await insertFollowup(tx, org, ids.vet1, {
      ...structuredClone(b),
      id: followupIds.vet1Case,
    });
    await insertFollowup(tx, org, ids.vet2, {
      ...structuredClone(c),
      id: followupIds.vet2Case,
    });
  });
});

/** Acteur tel que la garde serveur le construit : membre actif et permissions en base. */
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

describe("droits par défaut des rôles", () => {
  it("chaque membre reçoit en base les permissions par défaut de son rôle", async () => {
    expect([...(await actor(ids.admin)).permissions]).toHaveLength(18);
    expect([...(await actor(ids.vet1)).permissions].sort()).toEqual([
      "agenda.capture",
      "agenda.read",
      "appointments.confirm",
      "clinical.read",
      "followups.launch",
      "followups.read_own",
      "followups.share",
      "owner_messages.reply",
      "protocols.create_own",
      "stive.use",
    ]);
    expect([...(await actor(ids.assistant)).permissions].sort()).toEqual([
      "agenda.read",
      "followups.read_summary",
    ]);
  });

  it("le catalogue en base correspond exactement au code", async () => {
    const { rows } = await admin.query(
      "SELECT role, permission, is_default FROM role_permissions ORDER BY 1, 2",
    );
    const { ROLE_PERMISSIONS } = await import("@/domains/equipe/permissions");
    for (const role of ["admin_vet", "vet", "assistant"] as const) {
      const inDb = (
        rows as { role: string; permission: string; is_default: boolean }[]
      ).filter((row) => row.role === role);
      expect(
        inDb
          .filter((r) => r.is_default)
          .map((r) => r.permission)
          .sort(),
      ).toEqual([...ROLE_PERMISSIONS[role].defaults].sort());
      expect(
        inDb
          .filter((r) => !r.is_default)
          .map((r) => r.permission)
          .sort(),
      ).toEqual([...ROLE_PERMISSIONS[role].optional].sort());
    }
  });

  it("la base refuse une permission non autorisée pour le rôle", async () => {
    const code = await asApp(app, org, (client) =>
      errorCode(
        client.query(
          "INSERT INTO membership_permissions (organization_id, membership_id, permission) VALUES ($1, $2, 'team.manage')",
          [org, ids.assistant],
        ),
      ),
    );
    expect(code).toBe("23514");
  });
});

describe("visibilité des suivis", () => {
  it("l'administrateur voit tout le cabinet, en détail", async () => {
    const list = await suivis.list(await actor(ids.admin));
    expect(list).toHaveLength(3);
    expect(list.every((item) => item.access === "clinical")).toBe(true);
  });

  it("un vétérinaire ne voit que ses suivis", async () => {
    const list = await suivis.list(await actor(ids.vet1));
    expect(list.map((item) => item.id)).toEqual([followupIds.vet1Case]);
    expect(
      await suivis.open(await actor(ids.vet1), followupIds.vet2Case),
    ).toBeNull();
  });

  it("un assistant voit la liste sans aucun champ clinique", async () => {
    const list = await suivis.list(await actor(ids.assistant));
    expect(list).toHaveLength(3);
    for (const item of list) {
      expect(item.access).toBe("summary");
      expect(Object.keys(item)).not.toContain("procedure");
      expect(Object.keys(item)).not.toContain("triage");
      expect(Object.keys(item)).not.toContain("procedureAt");
    }
    const opened = await suivis.open(
      await actor(ids.assistant),
      followupIds.vet1Case,
    );
    expect(opened?.followup.access).toBe("summary");
    expect(JSON.stringify(opened)).not.toContain(
      fixtureFollowups[1]?.procedure,
    );
  });

  it("partage explicite : accès complet, retiré à la révocation ou à l'expiration", async () => {
    const vet1 = await actor(ids.vet1);
    const vet2 = await actor(ids.vet2);
    await suivis.share(vet1, followupIds.vet1Case, {
      membershipId: ids.vet2,
      expiresAt: null,
    });
    expect(
      (await suivis.open(vet2, followupIds.vet1Case))?.followup.access,
    ).toBe("clinical");
    // Le destinataire ne gère pas les accès d'un dossier qui ne lui appartient pas.
    expect(
      await domainError(suivis.setPrivate(vet2, followupIds.vet1Case, true)),
    ).toBe("forbidden");

    await suivis.revokeShare(vet1, followupIds.vet1Case, ids.vet2);
    expect(await suivis.open(vet2, followupIds.vet1Case)).toBeNull();

    await suivis.share(vet1, followupIds.vet1Case, {
      membershipId: ids.vet2,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await admin.query(
      "UPDATE followup_shares SET expires_at = now() - interval '1 second' WHERE followup_id = $1",
      [followupIds.vet1Case],
    );
    expect(await suivis.open(vet2, followupIds.vet1Case)).toBeNull();
  });

  it("dossier privé : invisible de l'administrateur et de l'assistant, sauf partage", async () => {
    const vet2 = await actor(ids.vet2);
    await suivis.setPrivate(vet2, followupIds.vet2Case, true);

    expect(
      await suivis.open(await actor(ids.admin), followupIds.vet2Case),
    ).toBeNull();
    expect(
      (await suivis.list(await actor(ids.assistant))).map((item) => item.id),
    ).not.toContain(followupIds.vet2Case);
    expect(
      (await suivis.open(vet2, followupIds.vet2Case))?.followup.isPrivate,
    ).toBe(true);

    await suivis.share(vet2, followupIds.vet2Case, {
      membershipId: ids.admin,
      expiresAt: null,
    });
    expect(
      (await suivis.open(await actor(ids.admin), followupIds.vet2Case))
        ?.followup.access,
    ).toBe("clinical");
    await suivis.revokeShare(vet2, followupIds.vet2Case, ids.admin);
    await suivis.setPrivate(vet2, followupIds.vet2Case, false);
  });

  it("refuse un partage vers un assistant, soi-même ou un autre cabinet", async () => {
    const vet1 = await actor(ids.vet1);
    const { rows } = await admin.query(
      "SELECT id FROM memberships WHERE organization_id = $1 LIMIT 1",
      [SEED.martin],
    );
    for (const target of [ids.assistant, ids.vet1, rows[0]?.id as string])
      expect(
        await domainError(
          suivis.share(vet1, followupIds.vet1Case, {
            membershipId: target,
            expiresAt: null,
          }),
        ),
      ).toBe("invalid_target");
  });

  it("un vétérinaire ne partage pas le suivi d'un confrère qu'il ne voit pas", async () => {
    expect(
      await domainError(
        suivis.share(await actor(ids.vet1), followupIds.vet2Case, {
          membershipId: ids.admin,
          expiresAt: null,
        }),
      ),
    ).toBe("not_found");
  });

  it("un autre cabinet n'ouvre jamais ces dossiers", async () => {
    const { rows } = await admin.query(
      "SELECT id FROM memberships WHERE organization_id = $1 AND role = 'admin_vet'",
      [SEED.martin],
    );
    const martin = await actor(rows[0]?.id as string, SEED.martin);
    expect(await suivis.open(martin, followupIds.adminCase)).toBeNull();
  });

  it("chaque consultation est journalisée dans la même transaction", async () => {
    await suivis.open(await actor(ids.admin), followupIds.adminCase);
    const { rows } = await admin.query(
      "SELECT count(*)::int AS n FROM audit_events WHERE action = 'followup.viewed' AND target_id = $1 AND actor_membership_id = $2",
      [followupIds.adminCase, ids.admin],
    );
    expect(rows[0]?.n).toBeGreaterThan(0);
  });
});

describe("équipe et droits", () => {
  it("seul un membre autorisé gère l'équipe ou lit le journal", async () => {
    const vet1 = await actor(ids.vet1);
    expect(await domainError(team.members(vet1))).toBe("not_found");
    expect(await domainError(team.activity(vet1))).toBe("not_found");
    expect(
      await domainError(
        team.invite(vet1, {
          email: "x@essai.test",
          displayName: "X",
          role: "vet",
        }),
      ),
    ).toBe("not_found");
  });

  it("ouvrir un droit à un assistant change immédiatement ce qu'il reçoit", async () => {
    const adminActor = await actor(ids.admin);
    await team.setPermissions(adminActor, ids.assistant, [
      "followups.read_summary",
      "agenda.read",
      "clinical.read",
    ]);
    const list = await suivis.list(await actor(ids.assistant));
    expect(list.every((item) => item.access === "clinical")).toBe(true);

    expect(
      await domainError(
        team.setPermissions(adminActor, ids.assistant, ["team.manage"]),
      ),
    ).toBe("permission_not_allowed");
    expect(
      await domainError(team.setPermissions(adminActor, ids.admin, [])),
    ).toBe("self_action");

    await team.setPermissions(adminActor, ids.assistant, [
      "followups.read_summary",
      "agenda.read",
    ]);
    const { rows } = await admin.query(
      "SELECT metadata FROM audit_events WHERE action = 'membership.permissions_changed' AND target_id = $1 ORDER BY occurred_at",
      [ids.assistant],
    );
    expect(rows.map((row: { metadata: unknown }) => row.metadata)).toEqual([
      { added: ["clinical.read"], removed: [] },
      { added: [], removed: ["clinical.read"] },
    ]);
  });

  it("limite à 3 vétérinaires par cabinet, invitations en attente comprises", async () => {
    const adminActor = await actor(ids.admin);
    expect(
      await domainError(
        team.invite(adminActor, {
          email: `vet4-${tag}@essai.test`,
          displayName: "Dr Quatre",
          role: "vet",
        }),
      ),
    ).toBe("vet_limit");
    expect(
      await domainError(team.changeRole(adminActor, ids.assistant, "vet")),
    ).toBe("vet_limit");
  });

  it("invitation : lien à usage unique, compte créé avec les droits du rôle", async () => {
    const adminActor = await actor(ids.admin);
    const address = `asv2-${tag}@essai.test`;
    await team.invite(adminActor, {
      email: address,
      displayName: "Sam Accueil",
      role: "assistant",
    });
    expect(
      await domainError(
        team.invite(adminActor, {
          email: address,
          displayName: "Sam",
          role: "assistant",
        }),
      ),
    ).toBe("already_invited");
    expect(
      await domainError(
        team.invite(adminActor, {
          email: emails.vet1,
          displayName: "Dr Victor Un",
          role: "vet",
        }),
      ),
    ).toBe("already_member");

    const link = /(http\S+jeton=[\w-]+)/.exec(
      mailbox.lastTo(address)?.text ?? "",
    )?.[1];
    const token =
      new URL(link ?? "http://x").searchParams.get("jeton") ?? undefined;
    expect(await previewInvitation(appDb, token)).toMatchObject({
      email: address,
      role: "assistant",
      emailRegistered: false,
    });

    const passwordHash = await hashPassword("une phrase pour l'accueil");
    expect(
      await acceptInvitation(appDb, {
        token,
        displayName: "Sam Accueil",
        passwordHash,
      }),
    ).toBe("accepted");
    expect(
      await acceptInvitation(appDb, {
        token,
        displayName: "Sam Accueil",
        passwordHash,
      }),
    ).toBe("expired");

    const auth = authService({
      db: appDb,
      email: mailbox,
      appUrl: "http://localhost",
    });
    const login = await auth.login(
      { email: address, password: "une phrase pour l'accueil" },
      { ip: null, userAgent: null },
    );
    expect(login.status).toBe("signed_in");
    const members = await team.members(adminActor);
    const sam = members.find((member) => member.email === address);
    expect(sam?.permissions.sort()).toEqual([
      "agenda.read",
      "followups.read_summary",
    ]);
  });

  it("invitation révoquée ou adresse déjà enregistrée ailleurs : aucun compte créé", async () => {
    const adminActor = await actor(ids.admin);
    const revokedAddress = `revoque-${tag}@essai.test`;
    await team.invite(adminActor, {
      email: revokedAddress,
      displayName: "Révoqué",
      role: "assistant",
    });
    const revokedToken =
      new URL(
        /(http\S+jeton=[\w-]+)/.exec(
          mailbox.lastTo(revokedAddress)?.text ?? "",
        )?.[1] ?? "http://x",
      ).searchParams.get("jeton") ?? undefined;
    const [pending] = (await team.pendingInvitations(adminActor)).filter(
      (invitation) => invitation.email === revokedAddress,
    );
    await team.revokeInvitation(adminActor, pending?.id ?? "");
    expect(await previewInvitation(appDb, revokedToken)).toBeNull();

    // Adresse déjà inscrite : aucune invitation ni aucun e-mail (ADR 0039).
    const sentBefore = mailbox.sent.length;
    expect(
      await domainError(
        team.invite(adminActor, {
          email: "paul.martin@cabinet-martin.test",
          displayName: "Dr Paul Martin",
          role: "assistant",
        }),
      ),
    ).toBe("email_registered");
    expect(mailbox.sent.length).toBe(sentBefore);

    // Adresse inscrite ailleurs après l'envoi de l'invitation : l'acceptation est refusée.
    const later = `plus-tard-${tag}@essai.test`;
    await team.invite(adminActor, {
      email: later,
      displayName: "Inscrit Plus Tard",
      role: "assistant",
    });
    const token =
      new URL(
        /(http\S+jeton=[\w-]+)/.exec(mailbox.lastTo(later)?.text ?? "")?.[1] ??
          "http://x",
      ).searchParams.get("jeton") ?? undefined;
    const registered = await authService({
      db: appDb,
      email: mailbox,
      appUrl: "http://localhost",
    }).register(
      {
        organizationName: "Autre cabinet",
        displayName: "Dr Ailleurs",
        email: later,
        plan: "premium",
        password: "une phrase de passe du second cabinet",
        acceptTerms: true,
        authorized: true,
      },
      { ip: null, userAgent: null },
    );
    expect(registered.status).toBe("code_required");
    expect((await previewInvitation(appDb, token))?.emailRegistered).toBe(true);
    expect(
      await acceptInvitation(appDb, {
        token,
        displayName: "x",
        passwordHash: await hashPassword("peu importe ici 123"),
      }),
    ).toBe("email_registered");
  });

  it("départ d'un vétérinaire : réattribution obligatoire, puis session fermée", async () => {
    const adminActor = await actor(ids.admin);
    expect(await domainError(team.deactivate(adminActor, ids.vet2, null))).toBe(
      "reassignment_required",
    );
    expect(
      await domainError(team.deactivate(adminActor, ids.vet2, ids.assistant)),
    ).toBe("invalid_target");
    expect(
      await domainError(team.changeRole(adminActor, ids.vet2, "assistant")),
    ).toBe("reassignment_required");

    await team.deactivate(adminActor, ids.vet2, ids.vet1);
    const vet1List = await suivis.list(await actor(ids.vet1));
    expect(vet1List.map((item) => item.id).sort()).toEqual(
      [followupIds.vet1Case, followupIds.vet2Case].sort(),
    );
    const { rows } = await admin.query(
      "SELECT count(*)::int AS n FROM audit_events WHERE action = 'followup.reassigned' AND target_id = $1",
      [followupIds.vet2Case],
    );
    expect(rows[0]?.n).toBe(1);

    // Le compte retiré ne peut plus se connecter à ce cabinet.
    const auth = authService({
      db: appDb,
      email: mailbox,
      appUrl: "http://localhost",
    });
    expect(
      (
        await auth.login(
          { email: emails.vet2, password: FICTIONAL_LOGIN_PHRASE },
          { ip: null, userAgent: null },
        )
      ).status,
    ).toBe("invalid");

    await team.reactivate(adminActor, ids.vet2);
    expect(
      (await team.members(adminActor)).find((m) => m.membershipId === ids.vet2)
        ?.active,
    ).toBe(true);
  });

  it("le cabinet garde toujours un administrateur actif", async () => {
    expect(
      await domainError(
        team.deactivate(await actor(ids.admin), ids.admin, null),
      ),
    ).toBe("self_action");
    const code = await asApp(app, org, (client) =>
      errorCode(
        client.query("UPDATE memberships SET role = 'vet' WHERE id = $1", [
          ids.admin,
        ]),
      ),
    );
    expect(code).toBe("23514");
  });

  it("le journal d'activité montre actions et connexions du cabinet seulement", async () => {
    const log = await team.activity(await actor(ids.admin));
    const actions = new Set(log.actions.map((event) => event.action));
    for (const action of [
      "followup.viewed",
      "followup.shared",
      "followup.unshared",
      "followup.privacy_changed",
      "membership.permissions_changed",
      "invitation.created",
      "membership.deactivated",
      "followup.reassigned",
    ])
      expect(actions).toContain(action);
    expect(log.logins.length).toBeGreaterThan(0);
    const { rows } = await admin.query(
      "SELECT DISTINCT organization_id FROM audit_events WHERE id = ANY($1)",
      [log.actions.map((event) => event.id)],
    );
    expect(rows).toEqual([{ organization_id: org }]);
  });
});

describe("invitations, départs et places (ADR 0039)", () => {
  // Cabinet propre à ce bloc : deux administrateurs, un vétérinaire, deux assistants.
  const other = randomUUID();
  const otherTag = other.slice(0, 8);
  let m: {
    ada: string;
    bob: string;
    vet: string;
    asv1: string;
    asv2: string;
  };

  beforeAll(async () => {
    const [ada, bob, vet, asv1, asv2] = await createOrganization(
      appDb,
      other,
      "Clinique d'essai des départs",
      [
        {
          email: `ada-${otherTag}@essai.test`,
          displayName: "Dr Ada",
          role: "admin_vet",
        },
        {
          email: `bob-${otherTag}@essai.test`,
          displayName: "Dr Bob",
          role: "admin_vet",
        },
        {
          email: `vet-${otherTag}@essai.test`,
          displayName: "Dr Vic",
          role: "vet",
        },
        {
          email: `asv1-${otherTag}@essai.test`,
          displayName: "Asv Un",
          role: "assistant",
        },
        {
          email: `asv2-${otherTag}@essai.test`,
          displayName: "Asv Deux",
          role: "assistant",
        },
      ],
    );
    if (!ada || !bob || !vet || !asv1 || !asv2) throw new Error("cabinet");
    m = { ada, bob, vet, asv1, asv2 };
  });

  const tokenFor = (address: string) =>
    new URL(
      /(http\S+jeton=[\w-]+)/.exec(mailbox.lastTo(address)?.text ?? "")?.[1] ??
        "http://x",
    ).searchParams.get("jeton") ?? undefined;

  it("au départ de son auteur, une invitation est annulée et journalisée", async () => {
    const ada = await actor(m.ada, other);
    const bob = await actor(m.bob, other);
    const address = `invite-bob-${otherTag}@essai.test`;
    await team.invite(bob, {
      email: address,
      displayName: "Invité de Bob",
      role: "assistant",
    });
    const token = tokenFor(address);
    expect(await previewInvitation(appDb, token)).not.toBeNull();

    await team.deactivate(ada, m.bob, null);
    expect(await previewInvitation(appDb, token)).toBeNull();
    expect(
      await acceptInvitation(appDb, {
        token,
        displayName: "Invité de Bob",
        passwordHash: await hashPassword("une phrase pour l'invité"),
      }),
    ).toBe("expired");
    const { rows } = await admin.query(
      "SELECT metadata FROM audit_events WHERE organization_id = $1 AND action = 'invitation.revoked'",
      [other],
    );
    expect(rows).toEqual([{ metadata: { reason: "member_deactivated" } }]);
    await team.reactivate(ada, m.bob);
  });

  it("une invitation dont l'auteur est retiré hors service ne vaut plus non plus", async () => {
    const bob = await actor(m.bob, other);
    const address = `invite-ancienne-${otherTag}@essai.test`;
    await team.invite(bob, {
      email: address,
      displayName: "Ancienne",
      role: "assistant",
    });
    const token = tokenFor(address);
    await admin.query(
      "UPDATE memberships SET deactivated_at = now() WHERE id = $1",
      [m.bob],
    );
    try {
      expect(await previewInvitation(appDb, token)).toBeNull();
      expect(
        await acceptInvitation(appDb, {
          token,
          displayName: "Ancienne",
          passwordHash: await hashPassword("une phrase pour l'ancienne"),
        }),
      ).toBe("expired");
    } finally {
      await admin.query(
        "UPDATE memberships SET deactivated_at = NULL WHERE id = $1",
        [m.bob],
      );
    }
  });

  it("le départ ferme les sessions : elles ne reviennent pas avec l'accès", async () => {
    const auth = authService({
      db: appDb,
      email: mailbox,
      appUrl: "http://localhost",
    });
    const login = await auth.login(
      {
        email: `asv1-${otherTag}@essai.test`,
        password: FICTIONAL_LOGIN_PHRASE,
      },
      { ip: null, userAgent: null },
    );
    if (login.status !== "signed_in") throw new Error("session attendue");
    const ada = await actor(m.ada, other);
    await team.deactivate(ada, m.asv1, null);
    const { rows } = await admin.query(
      "SELECT count(*)::int AS n FROM auth.sessions WHERE membership_id = $1 AND revoked_at IS NULL",
      [m.asv1],
    );
    expect(rows[0]?.n).toBe(0);
    await team.reactivate(ada, m.asv1);
    expect(await auth.resolveSession(login.sessionToken)).toBeNull();
  });

  it("ne ferme jamais les sessions d'un autre cabinet ni d'un membre encore actif", async () => {
    const auth = authService({
      db: appDb,
      email: mailbox,
      appUrl: "http://localhost",
    });
    const login = await auth.login(
      {
        email: `asv2-${otherTag}@essai.test`,
        password: FICTIONAL_LOGIN_PHRASE,
      },
      { ip: null, userAgent: null },
    );
    if (login.status !== "signed_in") throw new Error("session attendue");
    const revoke = (organizationId: string) =>
      asApp(app, organizationId, async (client) => {
        const { rows } = await client.query(
          "SELECT auth.revoke_membership_sessions($1) AS n",
          [m.asv2],
        );
        return (rows[0] as { n: number } | undefined)?.n;
      });
    // Membre actif : rien n'est fermé, même depuis son cabinet.
    expect(await revoke(other)).toBe(0);
    await admin.query(
      "UPDATE memberships SET deactivated_at = now() WHERE id = $1",
      [m.asv2],
    );
    try {
      // Membre retiré, mais d'un autre cabinet que le cabinet courant.
      expect(await revoke(org)).toBe(0);
      expect(await revoke(other)).toBe(1);
    } finally {
      await admin.query(
        "UPDATE memberships SET deactivated_at = NULL WHERE id = $1",
        [m.asv2],
      );
    }
  });

  it("au plus 20 invitations par jour et par cabinet, annulées comprises", async () => {
    const ada = await actor(m.ada, other);
    let sent = 0;
    // Les invitations déjà envoyées par ce cabinet comptent aussi.
    for (let index = 0; index < 25; index += 1) {
      const outcome = await domainError(
        team.invite(ada, {
          email: `lot-${index}-${otherTag}@essai.test`,
          displayName: `Invité ${index}`,
          role: "assistant",
        }),
      );
      if (outcome === "invitation_limit") break;
      expect(outcome).toBeUndefined();
      sent += 1;
      const [pending] = (await team.pendingInvitations(ada)).filter(
        (invitation) =>
          invitation.email === `lot-${index}-${otherTag}@essai.test`,
      );
      await team.revokeInvitation(ada, pending?.id ?? "");
    }
    const { rows } = await admin.query(
      "SELECT count(*)::int AS n FROM invitations WHERE organization_id = $1",
      [other],
    );
    expect(rows[0]?.n).toBe(20);
    expect(sent).toBeLessThan(20);
  });

  it("le dernier administrateur actif ne peut être retiré : refus métier", async () => {
    const ada = await actor(m.ada, other);
    await team.changeRole(ada, m.bob, "vet");
    try {
      // Acteur fictif doté de team.manage : seule la base peut encore refuser.
      const vic = {
        ...(await actor(m.vet, other)),
        permissions: new Set(["team.manage"] as const),
      };
      expect(await domainError(team.changeRole(vic, m.ada, "vet"))).toBe(
        "last_admin",
      );
      expect(await domainError(team.deactivate(vic, m.ada, null))).toBe(
        "last_admin",
      );
    } finally {
      await team.changeRole(ada, m.bob, "admin_vet");
    }
  });

  it("deux changements de rôle simultanés ne dépassent pas la limite de vétérinaires", async () => {
    // 3 vétérinaires actifs (Ada, Bob, Vic) : passer Vic assistant libère une seule place.
    const ada = await actor(m.ada, other);
    await team.changeRole(ada, m.vet, "assistant");
    const parallel = new Pool({ connectionString: inject("appUrl"), max: 4 });
    try {
      const concurrent = teamService({
        db: drizzle(parallel, { schema }),
        email: mailbox,
        appUrl: "http://localhost",
      });
      const outcomes = await Promise.all(
        [m.vet, m.asv2].map((id) =>
          domainError(concurrent.changeRole(ada, id, "vet")),
        ),
      );
      expect(outcomes.sort()).toEqual([undefined, "vet_limit"].sort());
    } finally {
      await parallel.end();
    }
  });
});
