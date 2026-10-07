import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";

import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${port}`;

/** Base préparée par tests/e2e/prepare-database.mts (voir `pnpm test:e2e`). */
function e2eDatabaseUrl(): string {
  try {
    return parseEnv(readFileSync(".env.e2e", "utf8")).DATABASE_URL ?? "";
  } catch {
    return "";
  }
}

const authState = "tests/e2e/.auth/claire.json";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    // Connexion de Claire (vétérinaire, code via Mailpit) une seule fois, réutilisée ensuite.
    { name: "connexion", testMatch: /connexion\.setup\.ts/ },
    {
      name: "desktop",
      dependencies: ["connexion"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        storageState: authState,
      },
    },
    {
      name: "mobile-320",
      dependencies: ["connexion"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 320, height: 640 },
        storageState: authState,
      },
    },
  ],
  // Les tests tournent contre le build de production, pas le serveur de développement.
  webServer: {
    command: `PORT=${port} pnpm start`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      APP_ENV: "local",
      APP_URL: baseURL,
      DATABASE_URL: e2eDatabaseUrl(),
      SMTP_HOST: process.env.E2E_SMTP_HOST ?? "localhost",
      SMTP_PORT: process.env.E2E_SMTP_PORT ?? "1025",
      // Photos, vocaux et captures des tests : hors du dépôt, jamais versionnés.
      OBJECT_STORAGE_DIR: join(tmpdir(), "stivea-e2e-objets"),
    },
  },
});
