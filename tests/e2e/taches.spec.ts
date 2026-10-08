import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

import { expect, test } from "@playwright/test";
import { Client } from "pg";

import { SEED } from "../../src/fixtures/seed-ids";

import { LEA, PHRASE } from "./support/accounts";
import { expectAccessible, login } from "./support/flows";

/** Tâche en échec propre à ce test, inscrite comme le ferait le worker (rôle applicatif, RLS). */
async function addDeadJob() {
  const url = parseEnv(readFileSync(".env.e2e", "utf8")).DATABASE_URL;
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.organization_id', $1, true)", [
      SEED.tilleuls,
    ]);
    await client.query(
      `INSERT INTO scheduled_jobs (organization_id, kind, idempotency_key, status, run_at, attempts, last_error_code, finished_at)
       VALUES ($1, 'followup.message', $2, 'dead', now() - interval '3 hours', 5, 'provider_rejected', now())`,
      [SEED.tilleuls, `e2e:${randomUUID()}`],
    );
    await client.query("COMMIT");
  } finally {
    await client.end();
  }
}

test("l'administratrice voit les tâches en échec, sans contenu clinique", async ({
  page,
}) => {
  await page.goto("/app/taches");
  await expect(
    page.getByRole("heading", { level: 1, name: "Tâches en échec" }),
  ).toBeVisible();
  // Rappel bloqué du jeu fictif (suivi en pause d'Oscar).
  await expect(page.getByText("Rappel au propriétaire")).toBeVisible();
  await expect(
    page.getByText("Service d'envoi indisponible").first(),
  ).toBeVisible();
  await expectAccessible(page);
});

test("l'administratrice relance une tâche en échec", async ({ page }) => {
  await addDeadJob();
  await page.goto("/app/taches");
  await page
    .getByRole("button", { name: "Relancer : Message de Numa" })
    .first()
    .click();
  await expect(page).toHaveURL(/\/app\/taches\?fait=relance$/);
  await expect(page.getByRole("status")).toHaveText(
    "Tâche relancée : le worker la reprend dans un instant.",
  );
});

test("une assistante n'a pas accès aux tâches en échec", async ({
  browser,
}) => {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await login(page, LEA, PHRASE);
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("link", { name: "Tâches en échec" })).toHaveCount(
    0,
  );
  const response = await page.goto("/app/taches");
  expect(response?.status()).toBe(404);
  await context.close();
});
