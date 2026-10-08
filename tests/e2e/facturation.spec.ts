import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";

import { LEA, PAUL, PHRASE } from "./support/accounts";
import {
  expectAccessible,
  login,
  loginWithCode,
  signUp,
} from "./support/flows";

async function freshPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  return context.newPage();
}

test.describe("Clinique des Tilleuls (Claire)", () => {
  test("formule, suivis inclus et factures prélevées", async ({ page }) => {
    await page.goto("/app/facturation");
    await expect(
      page.getByRole("heading", { level: 1, name: "Facturation" }),
    ).toBeVisible();
    await expect(page.getByText("Clinique", { exact: true })).toBeVisible();
    await expect(page.getByText(/^\d+ \/ 10 inclus$/)).toBeVisible();
    await expect(page.getByText("Payée").first()).toBeVisible();
    await expectAccessible(page);

    // Le choix de l'engagement est explicite ; rester au mois arrête le rappel.
    await expect(
      page.getByRole("heading", { name: "Engagement annuel" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Passer à l'engagement annuel" })
      .click();
    await expect(
      page.getByText("Cochez la case de confirmation pour continuer."),
    ).toBeVisible();
    // Choix enregistré une fois pour toutes : vérifié sur un seul format d'écran.
    if (test.info().project.name !== "desktop") return;
    // Tant que le choix est à faire, il est rappelé sur tout l'espace cabinet (ADR 0023).
    const notice = page.getByText(
      "Après l'essai : choisissez entre l'engagement annuel et le mois. Sans réponse, rien ne bascule.",
    );
    await expect(notice).toBeVisible();
    await page.getByRole("button", { name: "Rester au mois" }).click();
    await expect(
      page.getByText("Possible à tout moment, sur votre demande uniquement."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Rester au mois" }),
    ).toHaveCount(0);
    await page.goto("/app");
    await expect(notice).toHaveCount(0);
  });
});

test.describe("cabinet du Dr Martin, en impayé", () => {
  test("régulariser un prélèvement refusé", async ({ browser }) => {
    test.skip(
      test.info().project.name !== "desktop",
      "La régularisation modifie le cabinet fictif : un seul format d'écran.",
    );
    const page = await freshPage(browser);
    await loginWithCode(page, PAUL, PHRASE);
    // Le rappel apparaît sur tout l'espace pour qui gère la facturation.
    await expect(
      page.getByText(/^Prélèvement refusé : à régulariser avant le/),
    ).toBeVisible();
    await page.getByRole("link", { name: "Ouvrir la facturation" }).click();
    await expect(
      page.getByText("Prélèvement refusé", { exact: true }),
    ).toBeVisible();
    await expectAccessible(page);
    await page
      .getByRole("button", { name: "Relancer le prélèvement (simulé)" })
      .first()
      .click();
    await expect(page.getByText(/Prélèvement refusé/)).toHaveCount(0);
  });
});

test.describe("nouveau cabinet", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("formule Solo choisie à l'inscription, limite et résiliation", async ({
    page,
  }) => {
    await signUp(page, "Solo");
    await page.goto("/app/facturation");
    await expect(page.getByText("Solo", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/^Essai pilote, mois 1 sur 2, puis/),
    ).toBeVisible();
    // Sans mandat signé, la première facture attend.
    await expect(page.getByText("À prélever", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Mandat de prélèvement à signer"),
    ).toBeVisible();
    await expectAccessible(page);

    // Solo : un seul vétérinaire.
    await page.goto("/app/equipe");
    await page.getByLabel("Nom").fill("Dr Victor Invité");
    await page.getByLabel("Adresse e-mail").fill("victor-solo@essai.test");
    await page.getByRole("button", { name: "Envoyer l'invitation" }).click();
    await expect(
      page.getByText(/Votre formule est au complet en vétérinaires/),
    ).toBeVisible();

    await page.goto("/app/facturation");
    await page.getByLabel(/Je confirme la résiliation/).check();
    await page.getByRole("button", { name: "Résilier l'abonnement" }).click();
    await expect(
      page.getByText(/^Abonnement résilié, effectif le/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Résilier l'abonnement" }),
    ).toHaveCount(0);
  });
});

test.describe("assistant (Léa)", () => {
  test("n'a pas accès à la facturation", async ({ browser }) => {
    const page = await freshPage(browser);
    await login(page, LEA, PHRASE);
    await expect(page).toHaveURL(/\/app$/);
    const response = await page.goto("/app/facturation");
    expect(response?.status()).toBe(404);
  });
});
