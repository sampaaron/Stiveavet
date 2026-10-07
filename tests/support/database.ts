import { execFileSync } from "node:child_process";
import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";

import { seedFictionalCabinets } from "../../db/seed/cabinets-fictifs";
import { loadMigrations, migrateUp } from "../../src/server/db/migrations";
import * as schema from "../../src/server/db/schema";

/**
 * Prépare une base jetable (tests d'intégration, e2e) : rôles, migrations, jeu fictif.
 * Les rôles sont communs à l'instance : on réutilise les mots de passe du `.env` local
 * s'ils sont définis (sinon ceux de test), pour ne pas casser une pile Compose existante.
 */
export async function prepareDatabase(adminRoot: string, database: string) {
  const migratorPassword =
    process.env.STIVEA_MIGRATOR_PASSWORD || "migrator-test-only";
  const appPassword = process.env.STIVEA_APP_PASSWORD || "app-test-only";
  const root = process.cwd();

  const admin = new Client({ connectionString: adminRoot });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await admin.end();

  // Le script de rôles de production locale est exécuté tel quel : il est donc testé lui aussi.
  execFileSync(
    "psql",
    [
      adminRoot,
      "-q",
      "-v",
      `migrator_password=${migratorPassword}`,
      "-v",
      `app_password=${appPassword}`,
      "-v",
      `database=${database}`,
      "-f",
      path.join(root, "db/bootstrap/roles.sql"),
    ],
    { stdio: "inherit" },
  );

  const adminUrl = withDatabase(adminRoot, database);
  const migratorUrl = withDatabase(
    adminRoot,
    database,
    "stivea_migrator",
    migratorPassword,
  );
  const appUrl = withDatabase(adminRoot, database, "stivea_app", appPassword);

  const migrator = new Client({ connectionString: migratorUrl });
  await migrator.connect();
  await migrateUp(
    migrator,
    await loadMigrations(path.join(root, "db/migrations")),
  );
  await migrator.end();

  const appPool = new Pool({ connectionString: appUrl });
  await seedFictionalCabinets(drizzle(appPool, { schema }));
  await appPool.end();

  return { adminUrl, migratorUrl, appUrl };
}

export async function dropDatabase(adminRoot: string, database: string) {
  const admin = new Client({ connectionString: adminRoot });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await admin.end();
}

function withDatabase(
  url: string,
  database: string,
  user?: string,
  password?: string,
): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  if (user) parsed.username = user;
  if (password) parsed.password = password;
  return parsed.toString();
}
