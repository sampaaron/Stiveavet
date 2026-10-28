import { afterAll, describe, expect, it } from "vitest";

import type { Actor } from "@/domains/commun/actor";
import { ROLE_PERMISSIONS } from "@/domains/equipe/permissions";
import { accountOverview } from "@/server/auth/account-overview";

import { pools } from "./support/db";

/**
 * « Mon compte » : chacun ne lit que son propre compte, sous RLS, et ses suivis comptés
 * sans suivis test ni ceux d'un confrère ou d'un autre cabinet.
 */

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

async function actor(email: string): Promise<Actor> {
  const { rows } = await admin.query<{
    id: string;
    user_id: string;
    role: Actor["role"];
    organization_id: string;
  }>(
    `SELECT m.id, m.user_id, m.role, m.organization_id FROM memberships m
     JOIN users u ON u.id = m.user_id WHERE u.email = $1`,
    [email],
  );
  const row = rows[0];
  if (!row) throw new Error(`Membre fictif introuvable : ${email}`);
  return {
    organizationId: row.organization_id,
    userId: row.user_id,
    membershipId: row.id,
    role: row.role,
    permissions: new Set(ROLE_PERMISSIONS[row.role].defaults),
  };
}

async function expectedFollowups(membershipId: string, status: string) {
  const { rows } = await admin.query<{ total: string }>(
    `SELECT count(*) AS total FROM followups
     WHERE responsible_membership_id = $1 AND status = $2 AND NOT is_test`,
    [membershipId, status],
  );
  return Number(rows[0]?.total ?? 0);
}

describe("Mon compte", () => {
  it("montre à une vétérinaire son identité, son cabinet et ses seuls suivis", async () => {
    const claire = await actor("claire.fontaine@tilleuls.test");
    const overview = await accountOverview(
      { ...claire, plan: "premium" },
      { db: appDb },
    );

    expect(overview.email).toBe("claire.fontaine@tilleuls.test");
    expect(overview.displayName).toMatch(/Claire Fontaine/);
    expect(overview.organizationName).toMatch(/Tilleuls/);
    for (const status of ["active", "paused", "draft"] as const)
      expect(overview.followups[status]).toBe(
        await expectedFollowups(claire.membershipId, status),
      );
    expect(overview.followups.active).toBeGreaterThan(0);
    expect(overview.stive).toEqual({ used: expect.any(Number), limit: 600 });
  });

  it("ne compte rien pour une assistante sans suivi, ni Stive sans le droit", async () => {
    const lea = await actor("lea.roux@tilleuls.test");
    const overview = await accountOverview(
      {
        ...lea,
        permissions: new Set(
          [...lea.permissions].filter((key) => key !== "stive.use"),
        ),
        plan: "premium",
      },
      { db: appDb },
    );

    expect(overview.email).toBe("lea.roux@tilleuls.test");
    expect(Object.values(overview.followups).every((n) => n === 0)).toBe(true);
    expect(overview.stive).toBeNull();
  });

  it("reste dans son cabinet : un autre cabinet ne voit ni les suivis ni le nom des Tilleuls", async () => {
    const paul = await actor("paul.martin@cabinet-martin.test");
    const overview = await accountOverview(
      { ...paul, plan: "starter" },
      { db: appDb },
    );

    expect(overview.email).toBe("paul.martin@cabinet-martin.test");
    expect(overview.organizationName).not.toMatch(/Tilleuls/);
    for (const status of ["active", "paused", "draft"] as const)
      expect(overview.followups[status]).toBe(
        await expectedFollowups(paul.membershipId, status),
      );
  });

  it("refuse une adhésion d'un autre cabinet glissée dans le contexte", async () => {
    const claire = await actor("claire.fontaine@tilleuls.test");
    const paul = await actor("paul.martin@cabinet-martin.test");
    await expect(
      accountOverview(
        { ...paul, membershipId: claire.membershipId, plan: "starter" },
        { db: appDb },
      ),
    ).rejects.toThrow("Compte introuvable");
  });
});
