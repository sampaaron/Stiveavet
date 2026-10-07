import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { SEED } from "../../db/seed/cabinets-fictifs";
import { followups } from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";

import { asApp, errorCode, pools } from "./support/db";

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

describe("rôle applicatif stivea_app", () => {
  it("n'est ni superutilisateur, ni BYPASSRLS, ni propriétaire d'une table", async () => {
    const { rows } = await admin.query(
      "SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = 'stivea_app'",
    );
    const owned = await admin.query(
      "SELECT count(*)::int AS n FROM pg_tables WHERE tableowner = 'stivea_app'",
    );

    expect(rows[0]).toEqual({
      rolsuper: false,
      rolbypassrls: false,
      rolcreaterole: false,
      rolcreatedb: false,
    });
    expect(owned.rows[0]).toEqual({ n: 0 });
  });

  it.each([
    ["modifier", "UPDATE audit_events SET action = 'x.y'"],
    ["supprimer", "DELETE FROM audit_events"],
    ["vider", "TRUNCATE audit_events"],
  ])("ne peut pas %s le journal d'activité", async (_label, statement) => {
    expect(
      await asApp(app, SEED.tilleuls, (client) =>
        errorCode(client.query(statement)),
      ),
    ).toBe("42501");
  });

  it("ne peut ni lire le registre des migrations ni créer de table", async () => {
    expect(
      await asApp(app, SEED.tilleuls, (c) =>
        errorCode(c.query("SELECT * FROM schema_migrations")),
      ),
    ).toBe("42501");
    expect(
      await asApp(app, SEED.tilleuls, (c) =>
        errorCode(c.query("CREATE TABLE intrus (id int)")),
      ),
    ).toBe("42501");
  });

  it("ne peut pas désactiver la RLS", async () => {
    expect(
      await asApp(app, SEED.tilleuls, (c) =>
        errorCode(c.query("ALTER TABLE followups DISABLE ROW LEVEL SECURITY")),
      ),
    ).toBe("42501");
  });
});

describe("catalogue : toute table métier est protégée", () => {
  it("chaque table du schéma public (hors registre des migrations) a une RLS activée et forcée, avec une politique", async () => {
    const { rows } = await admin.query(`
      SELECT c.relname AS table, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced,
             (SELECT count(*)::int FROM pg_policies p WHERE p.tablename = c.relname) AS policies
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'schema_migrations'
      ORDER BY 1`);

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows as Array<{
      table: string;
      enabled: boolean;
      forced: boolean;
      policies: number;
    }>) {
      expect(row, row.table).toMatchObject({ enabled: true, forced: true });
      expect(row.policies, row.table).toBeGreaterThan(0);
    }
  });

  it("chaque table portant organization_id la filtre dans sa politique", async () => {
    const { rows } = await admin.query(`
      SELECT t.table_name AS table, string_agg(p.qual, ' ') AS qual
      FROM information_schema.columns t
      JOIN pg_policies p ON p.tablename = t.table_name
      WHERE t.table_schema = 'public' AND t.column_name = 'organization_id'
      GROUP BY t.table_name`);

    for (const row of rows as Array<{ table: string; qual: string }>) {
      expect(row.qual, row.table).toContain("current_organization_id()");
    }
  });
});

describe("withTenant", () => {
  it("ne laisse pas fuir le cabinet hors de sa transaction", async () => {
    const inside = await withTenant(
      appDb,
      { organizationId: SEED.tilleuls },
      (tx) => tx.select({ id: followups.id }).from(followups),
    );
    // Le pool n'a qu'une connexion : la requête suivante réutilise exactement la même.
    const after = await appDb.execute(
      sql`SELECT count(*)::int AS n FROM followups`,
    );

    expect(inside).toHaveLength(7);
    expect(after.rows[0]).toEqual({ n: 0 });
  });

  it("refuse un identifiant de cabinet qui n'est pas un UUID", async () => {
    await expect(
      withTenant(appDb, { organizationId: "' OR 1=1 --" }, (tx) =>
        tx.select().from(followups),
      ),
    ).rejects.toThrow();
  });
});
