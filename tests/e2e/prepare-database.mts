/**
 * Base dédiée aux tests de bout en bout (`stivea_e2e`), recréée à chaque exécution.
 * Écrit l'URL du rôle applicatif dans .env.e2e, lu par playwright.config.ts.
 */
import { writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

import { parisWallMinutes } from "../../src/domains/reglages/content";
import { prepareDatabase } from "../support/database";

const adminRoot = process.env.TEST_DATABASE_ADMIN_URL;
if (!adminRoot) {
  console.error(
    "TEST_DATABASE_ADMIN_URL manquante (voir README, « Vérifier »)",
  );
  process.exit(1);
}

// Les dossiers fictifs sont datés par rapport au jour de Paris (« aujourd'hui », J+2…) : une
// exécution qui franchirait minuit verrait les rendez-vous du jour passer à la veille.
const MARGIN_MINUTES = 15;
const minutesToMidnight = 1440 - (parisWallMinutes(new Date()) % 1440);
if (minutesToMidnight <= MARGIN_MINUTES) {
  console.warn("Minuit à Paris approche : attente du jour suivant.");
  await sleep(minutesToMidnight * 60_000 + 5_000);
}

const { appUrl } = await prepareDatabase(adminRoot, "stivea_e2e");
await writeFile(".env.e2e", `DATABASE_URL=${appUrl}\n`, { mode: 0o600 });
console.warn("Base stivea_e2e prête.");
