/**
 * Base dédiée aux tests de bout en bout (`stivea_e2e`), recréée à chaque exécution.
 * Écrit l'URL du rôle applicatif dans .env.e2e, lu par playwright.config.ts.
 */
import { writeFile } from "node:fs/promises";

import { prepareDatabase } from "../support/database";

const adminRoot = process.env.TEST_DATABASE_ADMIN_URL;
if (!adminRoot) {
  console.error(
    "TEST_DATABASE_ADMIN_URL manquante (voir README, « Vérifier »)",
  );
  process.exit(1);
}

const { appUrl } = await prepareDatabase(adminRoot, "stivea_e2e");
await writeFile(".env.e2e", `DATABASE_URL=${appUrl}\n`, { mode: 0o600 });
console.warn("Base stivea_e2e prête.");
