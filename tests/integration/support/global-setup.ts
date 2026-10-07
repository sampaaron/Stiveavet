import { randomBytes } from "node:crypto";

import type { TestProject } from "vitest/node";

import { dropDatabase, prepareDatabase } from "../../support/database";

declare module "vitest" {
  export interface ProvidedContext {
    adminUrl: string;
    migratorUrl: string;
    appUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const adminRoot = process.env.TEST_DATABASE_ADMIN_URL;
  if (!adminRoot)
    throw new Error(
      "TEST_DATABASE_ADMIN_URL manquante (superutilisateur PostgreSQL de test)",
    );

  const database = `stivea_test_${randomBytes(4).toString("hex")}`;
  const urls = await prepareDatabase(adminRoot, database);
  project.provide("adminUrl", urls.adminUrl);
  project.provide("migratorUrl", urls.migratorUrl);
  project.provide("appUrl", urls.appUrl);

  return () => dropDatabase(adminRoot, database);
}
