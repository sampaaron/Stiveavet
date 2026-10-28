import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { expectAccessible } from "./support/flows";

/**
 * Mode sombre (ADR 0052) : choisi dans les Réglages ou dans Mon compte, il s'applique dès le
 * rendu serveur, garde des contrastes AA sur chaque écran et revient au clair d'un clic.
 */
const PAGES = [
  "/app",
  "/app/suivis",
  "/app/animaux",
  "/app/alertes",
  "/app/agenda",
  "/app/protocoles",
  "/app/stive",
  "/app/equipe",
  "/app/facturation",
  "/app/journal",
  "/app/taches",
  "/app/integrations",
  "/app/reponses",
  "/app/documents",
  "/app/aide",
  "/app/reglages",
  "/app/compte",
];

async function chooseMode(page: Page, from: string, label: string) {
  await page.goto(from);
  const card = page.locator("#affichage");
  await card.getByRole("button", { name: new RegExp(`^${label}`) }).click();
  await expect(
    card.getByRole("button", { name: new RegExp(`^${label}`) }),
  ).toHaveAttribute("aria-pressed", "true");
}

const background = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe("mode sombre", () => {
  // Le choix est gardé dans le compte de Claire : on revient toujours au clair.
  test.afterEach(async ({ page }) => {
    await chooseMode(page, "/app/compte", "Clair");
  });

  test("choisi dans les Réglages, il s'applique à tout l'espace avec des contrastes lisibles", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "Tour complet des écrans : un seul format d'écran.",
    );
    test.setTimeout(180_000);

    await chooseMode(page, "/app/reglages", "Sombre");
    await expect(page).toHaveURL(/\/app\/reglages#affichage$/);
    await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
    expect(await background(page)).toBe("rgb(0, 0, 0)");

    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
      await expectAccessible(page);
    }
  });

  test("« Automatique » suit l'appareil, et le choix vaut aussi sur la page de connexion", async ({
    page,
    browser,
  }) => {
    await chooseMode(page, "/app/compte", "Automatique");
    await page.emulateMedia({ colorScheme: "light" });
    expect(await background(page)).toBe("rgb(246, 248, 247)");
    await page.emulateMedia({ colorScheme: "dark" });
    expect(await background(page)).toBe("rgb(0, 0, 0)");
    await expectAccessible(page);

    // Même cookie, sans session : l'écran de connexion arrive déjà en sombre.
    const mode = (await page.context().cookies()).find(
      (cookie) => cookie.name === "sv_mode",
    );
    expect(mode?.value).toBe("system");
    if (!mode) return;
    const visitor = await browser.newContext({ colorScheme: "dark" });
    await visitor.addCookies([{ ...mode, value: "dark" }]);
    const login = await visitor.newPage();
    await login.goto("/connexion");
    await expect(login.locator("html")).toHaveAttribute("data-mode", "dark");
    await expectAccessible(login);
    await visitor.close();
  });
});
