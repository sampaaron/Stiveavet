import { afterAll, describe, expect, it } from "vitest";

import { SEED } from "../../db/seed/cabinets-fictifs";

import { TENANT_TABLES, asApp, errorCode, pools } from "./support/db";

const { app, admin } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

async function anyRowOf(table: string, organizationId: string) {
  const { rows } = await admin.query(
    `SELECT * FROM ${table} WHERE organization_id = $1 LIMIT 1`,
    [organizationId],
  );
  return rows[0] as Record<string, unknown> | undefined;
}

describe("isolation entre cabinets (RLS)", () => {
  it.each(TENANT_TABLES)(
    "%s : un cabinet ne voit jamais les lignes d'un autre",
    async (table) => {
      const visible = await asApp(app, SEED.tilleuls, async (client) => {
        const { rows } = await client.query(
          `SELECT DISTINCT organization_id FROM ${table}`,
        );
        return rows.map(
          (row: { organization_id: string }) => row.organization_id,
        );
      });

      expect(visible.every((id) => id === SEED.tilleuls)).toBe(true);
    },
  );

  it.each([...TENANT_TABLES, "organizations", "users"])(
    "%s : sans cabinet défini, aucune ligne n'est visible",
    async (table) => {
      const count = await asApp(app, null, async (client) => {
        const { rows } = await client.query(
          `SELECT count(*)::int AS n FROM ${table}`,
        );
        return (rows[0] as { n: number }).n;
      });

      expect(count).toBe(0);
    },
  );

  it("les données fictives existent bien des deux côtés (le test d'isolation n'est pas vide)", async () => {
    const { rows } = await admin.query(
      "SELECT organization_id, count(*)::int AS n FROM followups GROUP BY organization_id",
    );
    const counts = new Map(
      rows.map((row: { organization_id: string; n: number }) => [
        row.organization_id,
        row.n,
      ]),
    );

    expect(counts.get(SEED.tilleuls)).toBe(7);
    expect(counts.get(SEED.martin)).toBe(1);
  });

  it("refuse d'écrire une ligne au nom d'un autre cabinet", async () => {
    const code = await asApp(app, SEED.tilleuls, (client) =>
      errorCode(
        client.query(
          "INSERT INTO owners (organization_id, full_name) VALUES ($1, 'Intrus')",
          [SEED.martin],
        ),
      ),
    );

    expect(code).toBe("42501");
  });

  it("refuse de déplacer une ligne vers un autre cabinet", async () => {
    const code = await asApp(app, SEED.tilleuls, (client) =>
      errorCode(
        client.query("UPDATE owners SET organization_id = $1", [SEED.martin]),
      ),
    );

    expect(code).toBe("42501");
  });

  it("ne modifie ni ne supprime les lignes d'un autre cabinet", async () => {
    const result = await asApp(app, SEED.tilleuls, async (client) => {
      const updated = await client.query(
        "UPDATE animals SET name = 'Piraté' WHERE organization_id = $1",
        [SEED.martin],
      );
      const deleted = await client.query(
        "DELETE FROM owners WHERE organization_id = $1",
        [SEED.martin],
      );
      return { updated: updated.rowCount, deleted: deleted.rowCount };
    });

    expect(result).toEqual({ updated: 0, deleted: 0 });
    expect(await anyRowOf("animals", SEED.martin)).toMatchObject({
      name: "Sushi",
    });
  });

  it("interdit à un suivi de pointer vers l'animal d'un autre cabinet", async () => {
    const foreignAnimal = await anyRowOf("animals", SEED.martin);
    const ownMember = await anyRowOf("memberships", SEED.tilleuls);

    const code = await asApp(app, SEED.tilleuls, (client) =>
      errorCode(
        client.query(
          `INSERT INTO followups (organization_id, animal_id, responsible_membership_id, procedure, procedure_at)
           VALUES ($1, $2, $3, 'Test', now())`,
          [SEED.tilleuls, foreignAnimal?.id, ownMember?.id],
        ),
      ),
    );

    expect(code).toBe("23503");
  });

  it("ne montre que les personnes membres du cabinet courant", async () => {
    const emails = await asApp(app, SEED.tilleuls, async (client) => {
      const { rows } = await client.query(
        "SELECT email FROM users ORDER BY email",
      );
      return rows.map((row: { email: string }) => row.email);
    });

    expect(emails).toHaveLength(4);
    expect(emails.every((email) => email.endsWith("@tilleuls.test"))).toBe(
      true,
    );
  });

  it("le cabinet courant ne voit que sa propre fiche", async () => {
    const ids = await asApp(app, SEED.martin, async (client) => {
      const { rows } = await client.query("SELECT id FROM organizations");
      return rows.map((row: { id: string }) => row.id);
    });

    expect(ids).toEqual([SEED.martin]);
  });
});

describe("contenu clinique : la base applique aussi la règle d'accès (ADR 0038)", () => {
  const CLINICAL = [
    "messages",
    "triage_events",
    "followup_imports",
    "followup_treatments",
  ] as const;

  async function userOf(email: string): Promise<string> {
    const { rows } = await admin.query(
      "SELECT id FROM users WHERE email = $1",
      [email],
    );
    const id = (rows[0] as { id: string } | undefined)?.id;
    if (!id) throw new Error("personne inconnue");
    return id;
  }

  /**
   * Compte les lignes visibles par `userId` (requête directe, sans filtre de l'application)
   * après `prepare`, fait en superutilisateur ; tout est annulé à la fin.
   */
  async function visible(
    userId: string | null,
    table: string,
    followupId: string | null,
    prepare: string[] = [],
  ): Promise<number> {
    const client = await admin.connect();
    try {
      await client.query("BEGIN");
      for (const statement of prepare) await client.query(statement);
      await client.query("SET LOCAL ROLE stivea_app");
      await client.query("SELECT set_config('app.organization_id', $1, true)", [
        SEED.tilleuls,
      ]);
      if (userId)
        await client.query("SELECT set_config('app.user_id', $1, true)", [
          userId,
        ]);
      const { rows } = followupId
        ? await client.query(
            `SELECT count(*)::int AS n FROM ${table} WHERE followup_id = $1`,
            [followupId],
          )
        : await client.query(`SELECT count(*)::int AS n FROM ${table}`);
      return (rows[0] as { n: number }).n;
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  }

  it("un assistant sans clinical.read ne lit aucun contenu clinique, même en direct", async () => {
    const lea = await userOf("lea.roux@tilleuls.test");
    const claire = await userOf("claire.fontaine@tilleuls.test");
    for (const table of CLINICAL) {
      expect(await visible(lea, table, null), table).toBe(0);
      // Le worker et les webhooks (aucune personne) gardent le seul filtre du cabinet.
      expect(await visible(null, table, null), table).toBeGreaterThan(0);
    }
    expect(await visible(claire, "messages", null)).toBeGreaterThan(0);
    // Les informations d'organisation restent lisibles.
    expect(await visible(lea, "followups", null)).toBe(7);
  });

  it("un confrère hors partage ne lit rien d'un dossier privé ; le partage ou le responsable, si", async () => {
    const claire = await userOf("claire.fontaine@tilleuls.test");
    const { rows } = await admin.query(
      `SELECT f.id, f.responsible_membership_id AS responsible, u.id AS responsible_user,
              me.id AS claire_member
       FROM followups f
       JOIN memberships m ON m.id = f.responsible_membership_id
       JOIN users u ON u.id = m.user_id
       JOIN memberships me ON me.organization_id = f.organization_id AND me.user_id = $2
       WHERE f.organization_id = $1 AND m.user_id <> $2
         AND EXISTS (SELECT 1 FROM messages x WHERE x.followup_id = f.id)
       LIMIT 1`,
      [SEED.tilleuls, claire],
    );
    const target = rows[0] as
      | {
          id: string;
          responsible: string;
          responsible_user: string;
          claire_member: string;
        }
      | undefined;
    if (!target) throw new Error("dossier d'un confrère attendu");
    const hide = `UPDATE followups SET is_private = true WHERE id = '${target.id}'`;
    const share = `INSERT INTO followup_shares (organization_id, followup_id, membership_id, granted_by_membership_id)
      VALUES ('${SEED.tilleuls}', '${target.id}', '${target.claire_member}', '${target.responsible}')
      ON CONFLICT (followup_id, membership_id) DO UPDATE SET revoked_at = NULL, expires_at = NULL`;
    const expired = `UPDATE followup_shares SET expires_at = now() - interval '1 minute'
      WHERE followup_id = '${target.id}'`;

    // Administratrice (lecture de tous les suivis) : dossier ouvert visible, privé invisible.
    expect(await visible(claire, "messages", target.id)).toBeGreaterThan(0);
    expect(await visible(claire, "messages", target.id, [hide])).toBe(0);
    expect(
      await visible(claire, "messages", target.id, [hide, share]),
    ).toBeGreaterThan(0);
    expect(
      await visible(claire, "messages", target.id, [hide, share, expired]),
    ).toBe(0);
    expect(
      await visible(target.responsible_user, "messages", target.id, [hide]),
    ).toBeGreaterThan(0);
  });

  it("refuse aussi d'écrire du contenu clinique dans un dossier inaccessible", async () => {
    const lea = await userOf("lea.roux@tilleuls.test");
    const client = await admin.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        "SELECT followup_id FROM triage_events WHERE organization_id = $1 LIMIT 1",
        [SEED.tilleuls],
      );
      const followupId = (rows[0] as { followup_id: string }).followup_id;
      await client.query("SET LOCAL ROLE stivea_app");
      await client.query("SELECT set_config('app.organization_id', $1, true)", [
        SEED.tilleuls,
      ]);
      await client.query("SELECT set_config('app.user_id', $1, true)", [lea]);
      expect(
        await errorCode(
          client.query(
            `INSERT INTO triage_events (organization_id, followup_id, level, source, reason)
             VALUES ($1, $2, 'normal', 'rule', 'Essai')`,
            [SEED.tilleuls, followupId],
          ),
        ),
      ).toBe("42501");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
