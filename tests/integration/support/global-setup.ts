import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import type { TestProject } from "vitest/node";

import { seedFictionalCabinets } from "../../../db/seed/cabinets-fictifs";
import { loadMigrations, migrateUp } from "../../../src/server/db/migrations";
import * as schema from "../../../src/server/db/schema";

const MIGRATOR_PASSWORD = "migrator-test-only";
const APP_PASSWORD = "app-test-only";

declare module "vitest" {
  export interface ProvidedContext {
    adminUrl: string;
    migratorUrl: string;
    appUrl: string;
  }
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

export default async function setup(project: TestProject) {
  const adminRoot = process.env.TEST_DATABASE_ADMIN_URL;
  if (!adminRoot)
    throw new Error(
      "TEST_DATABASE_ADMIN_URL manquante (superutilisateur PostgreSQL de test)",
    );

  const database = `stivea_test_${randomBytes(4).toString("hex")}`;
  const root = process.cwd();

  // Le script de rôles de production locale est exécuté tel quel : il est donc testé lui aussi.
  execFileSync(
    "psql",
    [
      adminRoot,
      "-q",
      "-v",
      `migrator_password=${MIGRATOR_PASSWORD}`,
      "-v",
      `app_password=${APP_PASSWORD}`,
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
    MIGRATOR_PASSWORD,
  );
  const appUrl = withDatabase(adminRoot, database, "stivea_app", APP_PASSWORD);

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

  project.provide("adminUrl", adminUrl);
  project.provide("migratorUrl", migratorUrl);
  project.provide("appUrl", appUrl);

  return async () => {
    const admin = new Client({ connectionString: adminRoot });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.end();
  };
}
