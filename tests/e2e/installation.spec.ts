import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";

import { LEA, PHRASE } from "./support/accounts";
import {
  expectAccessible,
  login,
  openAccountMenu,
  signUp,
} from "./support/flows";

async function freshPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  return context.newPage();
}

const progress = (page: Page, done: number) =>
  expect(page.getByText(`${done} étape(s) terminée(s) sur 8`)).toBeVisible();

test.describe("nouveau cabinet", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("installation guidée complète, avec des connexions simulées", async ({
    page,
  }) => {
    await signUp(page);
    await page.getByRole("link", { name: "Ouvrir le démarrage guidé" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Démarrage guidé" }),
    ).toBeVisible();
    await progress(page, 1);
    await expectAccessible(page);

    // WhatsApp et dr.veto : simulés, seul un libellé masqué reste.
    await page.getByLabel("Numéro WhatsApp Business").fill("06 12 34 56 78");
    await page
      .getByRole("button", { name: "Connecter le numéro (simulé)" })
      .click();
    await expect(page.getByText("•• •• •• •• 78 (simulé)")).toBeVisible();
    await expect(page.getByText("06 12 34 56 78")).toHaveCount(0);
    await page.getByLabel("Code du cabinet dr.veto").fill("CAB-1234");
    await page
      .getByRole("button", { name: "Connecter dr.veto (simulé)" })
      .click();
    await expect(page.getByText("Cabinet CA••• (simulé)")).toBeVisible();
    await progress(page, 3);

    // Règles : réglages de départ, puis un contact d'urgence.
    await page
      .getByRole("button", { name: "Appliquer les réglages de départ" })
      .click();
    await expect(
      page.getByText("À compléter : un contact d'urgence."),
    ).toBeVisible();
    await page.getByRole("link", { name: "Ouvrir les réglages" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Numa, urgences et garde" }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "La nuit", exact: true }),
    ).not.toBeEmpty();
    await page.getByLabel("Libellé du contact").fill("Accueil du cabinet");
    await page.getByLabel("Numéro", { exact: true }).fill("01 23 45 67 89");
    await page.getByRole("button", { name: "Ajouter le contact" }).click();
    await expect(
      page.getByRole("button", {
        name: "Retirer le contact Accueil du cabinet",
      }),
    ).toBeVisible();
    await expectAccessible(page);

    await page.goto("/app/demarrage");
    await progress(page, 4);
    await page.getByRole("button", { name: "L'équipe est prête" }).click();
    await progress(page, 5);

    // Le suivi test exige un protocole validé.
    await expect(
      page.getByText("Validez d'abord un protocole du cabinet."),
    ).toBeVisible();
    await page.goto("/app/protocoles");
    await page
      .getByRole("button", {
        name: "Ajouter « Détartrage et soins dentaires » au cabinet",
      })
      .click();
    await page
      .getByRole("link", { name: /Détartrage et soins dentaires/ })
      .click();
    await page.getByRole("button", { name: "Valider ce protocole" }).click();
    await expect(page.getByText("Validée par Dr Alix Essai")).toBeVisible();

    await page.goto("/app/demarrage");
    await progress(page, 6);
    await page
      .getByRole("button", { name: "Signer le mandat (simulé)" })
      .click();
    await expect(page.getByText("Mandat de prélèvement simulé")).toBeVisible();
    await progress(page, 7);

    await page.getByRole("button", { name: "Créer le suivi test" }).click();
    await expect(page).toHaveURL(/\/app\/suivis\/[0-9a-f-]{36}$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Animal test" }),
    ).toBeVisible();
    await expect(page.getByText("Suivi test", { exact: true })).toBeVisible();

    await page.goto("/app/demarrage");
    await progress(page, 8);
    await expect(page.getByText("Votre cabinet est prêt.")).toBeVisible();
    await expectAccessible(page);
  });
});

test.describe("réglages des Tilleuls (Claire)", () => {
  test("une garde ne peut pas en chevaucher une autre", async ({ page }) => {
    await page.goto("/app/reglages");
    // Le planning fictif prévoit Hugo, puis Inès.
    await expect(
      page.getByRole("button", {
        name: /^Retirer la garde de Dr Hugo Marchal/,
      }),
    ).toBeVisible();
    await page.getByLabel("Vétérinaire de garde").selectOption({
      label: "Dr Claire Fontaine",
    });
    // Par défaut : de l'heure suivante à 12 h plus tard, pendant la garde de Hugo.
    await page.getByRole("button", { name: "Ajouter la garde" }).click();
    await expect(
      page.getByText("Cette garde chevauche une garde déjà prévue."),
    ).toBeVisible();
  });

  test("le délai d'escalade se règle entre 3 et 5 heures", async ({ page }) => {
    await page.goto("/app/reglages");
    const delay = page.getByLabel(
      "Délai avant d'alerter les autres vétérinaires",
    );
    await expect(delay.locator("option")).toHaveText([
      "3 h",
      "3 h 30",
      "4 h",
      "4 h 30",
      "5 h",
    ]);
    await expect(
      page.getByLabel(/Analyse assistée des photos/),
    ).not.toBeChecked();
    await expect(page.getByText("•• •• •• •• 42 (simulé)")).toBeVisible();
    await expectAccessible(page);
  });
});

test.describe("assistant (Léa)", () => {
  test("n'a accès ni aux réglages ni au démarrage guidé", async ({
    browser,
  }) => {
    const page = await freshPage(browser);
    await login(page, LEA, PHRASE);
    await expect(page).toHaveURL(/\/app$/);
    for (const path of ["/app/reglages", "/app/demarrage"]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
    }
    await page.goto("/app");
    await openAccountMenu(page);
    await expect(
      page.getByRole("link", { name: "Numa, urgences et garde" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Démarrage guidé" }),
    ).toHaveCount(0);
  });
});
