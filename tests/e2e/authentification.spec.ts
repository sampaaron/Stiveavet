import { randomUUID } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { LEA, PHRASE } from "./support/accounts";
import { latestEmail, securityCode } from "./support/mailpit";

// Parcours sans session : chaque test part d'un navigateur vierge.
test.use({ storageState: { cookies: [], origins: [] } });

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

/** À 320 px, l'identité et les actions du compte sont dans le menu. */
async function openAccountMenu(page: Page) {
  const menu = page.getByRole("button", { name: "Ouvrir le menu" });
  if (await menu.isVisible()) await menu.click();
}

async function signUp(page: Page) {
  const email = `e2e-${randomUUID().slice(0, 8)}@essai.test`;
  const password = "une phrase de passe e2e solide";
  const since = new Date(Date.now() - 1000);
  await page.goto("/inscription");
  await page
    .getByLabel("Nom du cabinet")
    .fill("Cabinet vétérinaire de l'Essai");
  await page.getByLabel("Votre nom").fill("Dr Alix Essai");
  await page.getByLabel("Adresse e-mail professionnelle").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByLabel("Confirmer le mot de passe").fill(password);
  await page.getByRole("button", { name: "Créer le cabinet" }).click();

  await expect(page).toHaveURL(/\/connexion\/code\?origine=inscription$/);
  await page
    .getByLabel("Code de sécurité")
    .fill(await securityCode(email, since));
  await page.getByRole("button", { name: "Valider le code" }).click();
  await expect(page).toHaveURL(/\/app$/);
  return { email, password };
}

test("l'espace cabinet exige une connexion ; l'écran est accessible", async ({
  page,
}) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/connexion$/);
  await expect(
    page.getByRole("heading", { name: "Connexion à votre cabinet" }),
  ).toBeVisible();
  await expectAccessible(page);
});

test("une erreur de connexion ne dit pas si le compte existe", async ({
  page,
}) => {
  await login(page, "personne@inconnu.test", "mauvais mot de passe");
  await expect(
    page.getByRole("alert").filter({
      hasText: "Adresse e-mail ou mot de passe incorrect.",
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Adresse e-mail")).toHaveValue(
    "personne@inconnu.test",
  );
  await expect(page.getByLabel("Mot de passe")).toHaveValue("");
});

test("un assistant se connecte, verrouille, déverrouille puis se déconnecte", async ({
  page,
}) => {
  await login(page, LEA, PHRASE);
  await expect(page).toHaveURL(/\/app$/);
  await openAccountMenu(page);
  await expect(page.getByText("Léa Roux")).toBeVisible();

  await page.getByRole("button", { name: "Verrouiller" }).click();
  await expect(page).toHaveURL(/\/verrouillage$/);
  await expectAccessible(page);
  // Verrouillée, la session ne donne plus accès aux dossiers.
  await page.goto("/app");
  await expect(page).toHaveURL(/\/verrouillage$/);

  await page.getByLabel("Mot de passe").fill("mauvais mot de passe");
  await page.getByRole("button", { name: "Déverrouiller" }).click();
  await expect(page.getByText("Mot de passe incorrect.")).toBeVisible();
  await page.getByLabel("Mot de passe").fill(PHRASE);
  await page.getByRole("button", { name: "Déverrouiller" }).click();
  await expect(page).toHaveURL(/\/app$/);

  await openAccountMenu(page);
  await page.getByRole("button", { name: "Déconnexion" }).click();
  await expect(page).toHaveURL(/\/connexion\?raison=deconnexion$/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/connexion$/);
});

test("l'écran se verrouille seul après 40 minutes sans activité", async ({
  page,
}) => {
  await page.clock.install();
  await login(page, LEA, PHRASE);
  await expect(page).toHaveURL(/\/app$/);
  await page.clock.fastForward("40:30");
  await expect(page).toHaveURL(/\/verrouillage$/);
});

test("inscription d'un cabinet : code e-mail, puis cabinet vide et isolé", async ({
  page,
}) => {
  await signUp(page);
  await expect(
    page.getByRole("heading", { name: "Bonjour Alix" }),
  ).toBeVisible();
  await expect(page.getByText("Aucun suivi pour l'instant")).toBeVisible();
  // Les données fictives des Tilleuls ne sont jamais montrées à un autre cabinet.
  await expect(page.getByText("Caramel")).toHaveCount(0);
  const response = await page.goto(
    "/app/suivis/3f6b2a9e-1c4d-4e8a-9b51-7a0c2d5e8f11",
  );
  expect(response?.status()).toBe(404);
  await expect(page).not.toHaveTitle(/Caramel/);
});

test("mot de passe oublié : lien à usage unique, sessions fermées", async ({
  page,
  browser,
}) => {
  const account = await signUp(page);
  const other = await browser.newContext({ storageState: undefined });
  const otherPage = await other.newPage();

  const since = new Date(Date.now() - 1000);
  await otherPage.goto("/mot-de-passe-oublie");
  await otherPage.getByLabel("Adresse e-mail").fill(account.email);
  await otherPage.getByRole("button", { name: "Recevoir un lien" }).click();
  await expect(otherPage.getByRole("status")).toContainText(
    "Si un compte existe pour cette adresse",
  );

  const { Text } = await latestEmail(account.email, since);
  const link = /(http\S+jeton=[\w-]+)/.exec(Text)?.[1];
  expect(link).toBeDefined();
  await otherPage.goto(link ?? "");
  const newPassword = "un nouveau mot de passe tout neuf";
  await otherPage.getByLabel("Nouveau mot de passe").fill(newPassword);
  await otherPage.getByLabel("Confirmer le mot de passe").fill(newPassword);
  await otherPage
    .getByRole("button", { name: "Enregistrer le mot de passe" })
    .click();
  await expect(otherPage).toHaveURL(/\/connexion\?raison=mot-de-passe$/);

  // Le lien ne sert qu'une fois.
  await otherPage.goto(link ?? "");
  await expect(
    otherPage.getByText("Ce lien n'est plus valable."),
  ).toBeVisible();
  // La session ouverte avant le changement est fermée.
  await page.goto("/app");
  await expect(page).toHaveURL(/\/connexion$/);
  await other.close();
});
