import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";

import { LEA, PHRASE } from "./support/accounts";
import {
  expectAccessible,
  login,
  openAccountMenu,
  signUp,
} from "./support/flows";

const CARAMEL = "/app/suivis/3f6b2a9e-1c4d-4e8a-9b51-7a0c2d5e8f11";

async function freshPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  return context.newPage();
}

test.describe("protocoles du cabinet des Tilleuls (Claire)", () => {
  test("la bibliothèque installée montre ce qui reste à valider", async ({
    page,
  }) => {
    await page.goto("/app/protocoles");
    await expect(
      page.getByRole("heading", { level: 1, name: "Protocoles" }),
    ).toBeVisible();
    const castration = page
      .getByRole("link", { name: /Castration du chien\b/ })
      .first();
    await expect(castration).toContainText("À valider par un vétérinaire");
    await expect(
      page.getByRole("link", { name: /Stérilisation de la chatte/ }),
    ).toContainText("Validé");
    // Protocole personnel de Hugo : visible de l'administratrice, avec son auteur.
    await expect(page.getByText("de Dr Hugo Marchal")).toBeVisible();
    await expectAccessible(page);
  });

  test("un dossier indique la version de protocole avec laquelle il a été lancé", async ({
    page,
  }) => {
    await page.goto(CARAMEL);
    await page
      .getByRole("link", { name: "Stérilisation de la chienne, version 1" })
      .click();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Stérilisation de la chienne",
      }),
    ).toBeVisible();
    await expect(page.getByText("1 suivi(s) lancé(s) avec elle")).toBeVisible();
  });
});

test.describe("assistant (Léa)", () => {
  test("n'a pas accès aux protocoles par défaut", async ({ browser }) => {
    const page = await freshPage(browser);
    await login(page, LEA, PHRASE);
    await expect(page).toHaveURL(/\/app$/);
    const response = await page.goto("/app/protocoles");
    expect(response?.status()).toBe(404);
    await page.goto("/app");
    await openAccountMenu(page);
    await expect(page.getByRole("link", { name: "Protocoles" })).toHaveCount(0);
  });
});

test.describe("nouveau cabinet", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("ajouter, valider, modifier : chaque version reste consultable", async ({
    page,
  }) => {
    await signUp(page);
    await page.goto("/app/protocoles");
    await page
      .getByRole("button", {
        name: "Ajouter « Détartrage et soins dentaires » au cabinet",
      })
      .click();
    // Le modèle quitte la bibliothèque et rejoint les protocoles du cabinet.
    await expect(
      page.getByRole("button", {
        name: "Ajouter « Détartrage et soins dentaires » au cabinet",
      }),
    ).toHaveCount(0);

    await page
      .getByRole("link", { name: /Détartrage et soins dentaires/ })
      .click();
    await expect(
      page.getByText("Contenu fictif de démonstration"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Valider ce protocole" }).click();
    await expect(page.getByText("Validée par Dr Alix Essai")).toBeVisible();

    await page.getByRole("link", { name: "Modifier" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Modifier le protocole" }),
    ).toBeVisible();
    await page.getByLabel("Durée du suivi (jours)").fill("10");
    await page
      .getByRole("button", { name: "Ajouter un signe d'alerte" })
      .click();
    await page
      .getByLabel("Signe d'alerte 3", { exact: true })
      .fill("Gencives très rouges");
    await page
      .getByLabel("Ce qui change dans cette version")
      .fill("Suivi sur 10 jours");
    await expectAccessible(page);
    await page
      .getByRole("button", { name: "Enregistrer une nouvelle version" })
      .click();

    await expect(page.getByText("10 jours · version 2")).toBeVisible();
    await expect(page.getByText("Gencives très rouges")).toBeVisible();
    await page.getByRole("link", { name: "Version 1" }).click();
    await expect(page.getByText("Version 1, en lecture seule")).toBeVisible();
    await expect(page.getByText("Gencives très rouges")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Modifier" })).toHaveCount(0);
  });

  test("créer un protocole personnel, puis le dupliquer", async ({ page }) => {
    await signUp(page);
    await page.goto("/app/protocoles/nouveau");
    await page.getByLabel("Moi seul (protocole personnel)").check();
    await page.getByLabel("Nom du protocole").fill("Suivi après suture");
    await page
      .getByLabel("Contenu de l'étape 1")
      .fill("Prendre des nouvelles.");
    await page
      .getByLabel("Signe d'alerte 1", { exact: true })
      .fill("Plaie qui saigne");
    await page.getByRole("button", { name: "Créer le protocole" }).click();

    await expect(
      page.getByRole("heading", { level: 1, name: "Suivi après suture" }),
    ).toBeVisible();
    await expect(page.getByText("Validé", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/protocole personnel de Dr Alix Essai/),
    ).toBeVisible();
    await expectAccessible(page);

    await page
      .getByRole("button", { name: "Dupliquer pour le cabinet" })
      .click();
    await expect(page).toHaveURL(/\/modifier$/);
    await expect(page.getByLabel("Nom du protocole")).toHaveValue(
      "Suivi après suture (copie)",
    );
  });

  test("un contenu incomplet est refusé avec un message clair", async ({
    page,
  }) => {
    await signUp(page);
    await page.goto("/app/protocoles/nouveau");
    await page.getByLabel("Nom du protocole").fill("Incomplet");
    await page.getByRole("button", { name: "Créer le protocole" }).click();
    await expect(page.getByText("Étape : 2 caractères minimum.")).toBeVisible();
  });
});
