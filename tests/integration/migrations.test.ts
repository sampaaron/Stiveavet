import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, inject } from "vitest";

import { loadMigrations, migrateDown, migrateUp } from "@/server/db/migrations";
import * as schema from "@/server/db/schema";

import { seedFictionalCabinets } from "../../db/seed/cabinets-fictifs";

const migrationsDir = path.join(process.cwd(), "db/migrations");
const migrator = new Client({ connectionString: inject("migratorUrl") });

beforeAll(() => migrator.connect());
afterAll(() => migrator.end());

describe("migrations", () => {
  it("chaque migration a son inverse", async () => {
    const migrations = await loadMigrations(migrationsDir);

    expect(migrations.length).toBeGreaterThan(0);
    for (const migration of migrations)
      expect(migration.down.trim().length).toBeGreaterThan(0);
  });

  it("le schéma Drizzle correspond exactement aux colonnes créées par les migrations", async () => {
    const tables: PgTable[] = [];
    for (const value of Object.values(schema))
      if (is(value, PgTable)) tables.push(value);
    expect(tables.length).toBeGreaterThan(0);

    for (const table of tables) {
      const config = getTableConfig(table);
      const { rows } = await migrator.query(
        "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
        [config.name],
      );
      const actual = Object.fromEntries(
        rows.map((row: { column_name: string; is_nullable: string }) => [
          row.column_name,
          row.is_nullable === "NO",
        ]),
      );
      const expected = Object.fromEntries(
        config.columns.map((column) => [column.name, column.notNull]),
      );

      expect(actual, config.name).toEqual(expected);
    }
  });

  // Annule puis réapplique tout le schéma, puis recharge le jeu fictif : les autres fichiers
  // de tests n'ont ainsi pas à dépendre de l'ordre d'exécution.
  it("s'annulent puis se réappliquent sans erreur", async () => {
    const migrations = await loadMigrations(migrationsDir);
    let undone = 0;
    while (await migrateDown(migrator, migrations)) undone += 1;
    const reapplied = await migrateUp(migrator, migrations);

    expect(undone).toBe(migrations.length);
    expect(reapplied).toHaveLength(migrations.length);

    const app = new Pool({ connectionString: inject("appUrl"), max: 1 });
    try {
      await seedFictionalCabinets(drizzle(app, { schema }));
    } finally {
      await app.end();
    }
  });
});
