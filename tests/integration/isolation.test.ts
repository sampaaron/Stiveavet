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
