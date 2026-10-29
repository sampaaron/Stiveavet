// Ce test voit le bandeau : il part du test de base, sans choix déjà posé.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { expectAccessible } from "./support/flows";

/**
 * Bandeau de cookies (ADR 0053) : il s'affiche à l'arrivée, refuser est aussi simple
 * qu'accepter, rien de facultatif n'est coché d'avance, le choix revient au bout de six mois
 * et se change sur la politique de cookies.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const banner = (page: Page) =>
  page.getByRole("region", { name: "Vos cookies, votre choix" });

async function consentCookie(page: Page) {
  const cookies = await page.context().cookies();
  return cookies.find((cookie) => cookie.name === "sv_consent")?.value;
}

test("à l'arrivée sur le site, refuser est aussi simple qu'accepter", async ({
  page,
}) => {
  await page.goto("/fr");
  await expect(banner(page)).toBeVisible();
  expect(await consentCookie(page)).toBeUndefined();
  await expectAccessible(page);

  const refuse = banner(page).getByRole("button", { name: "Tout refuser" });
  const accept = banner(page).getByRole("button", { name: "Tout accepter" });
  expect(await refuse.getAttribute("class")).toBe(
    await accept.getAttribute("class"),
  );

  await refuse.click();
  await expect(banner(page)).toBeHidden();
  expect(await consentCookie(page)).toMatch(/^v1\.00\.\d{10}$/);
  await page.goto("/connexion");
  await expect(banner(page)).toBeHidden();
});

test("personnaliser, puis changer d'avis sur la politique de cookies", async ({
  page,
}) => {
  await page.goto("/connexion");
  await banner(page).locator("summary", { hasText: "Personnaliser" }).click();
  const audience = banner(page).getByRole("checkbox", {
    name: /Mesure d'audience/,
  });
  await expect(audience).not.toBeChecked();
  await expect(
    banner(page).getByRole("checkbox", { name: /Marketing/ }),
  ).not.toBeChecked();
  await audience.check();
  await banner(page)
    .getByRole("button", { name: "Enregistrer mes choix" })
    .click();
  await expect(banner(page)).toBeHidden();
  expect(await consentCookie(page)).toMatch(/^v1\.10\./);

  await page.goto("/fr");
  await page.getByRole("link", { name: "Gérer les cookies" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Politique de cookies" }),
  ).toBeVisible();
  await expect(page.getByText(/^Choix enregistré le /)).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /Mesure d'audience/ }),
  ).toBeChecked();
  await expect(
    page.getByRole("rowheader", { name: "sv_session" }),
  ).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("button", { name: "Tout accepter" }).click();
  await expect(page.getByRole("checkbox", { name: /Marketing/ })).toBeChecked();
  expect(await consentCookie(page)).toMatch(/^v1\.11\./);
});

test("un choix de plus de six mois est redemandé", async ({
  page,
  baseURL,
}) => {
  const sevenMonthsAgo = Math.floor(Date.now() / 1000) - 213 * 24 * 3600;
  await page
    .context()
    .addCookies([
      { name: "sv_consent", value: `v1.11.${sevenMonthsAgo}`, url: baseURL },
    ]);
  await page.goto("/en");
  await expect(
    page.getByRole("region", { name: "Your cookies, your choice" }),
  ).toBeVisible();
});
