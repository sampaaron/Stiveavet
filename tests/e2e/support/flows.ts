import { randomUUID } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { securityCode } from "./mailpit";

export async function expectAccessible(page: Page) {
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

export async function login(page: Page, email: string, password: string) {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

/** À 320 px, l'identité et les actions du compte sont dans le menu. */
export async function openAccountMenu(page: Page) {
  const menu = page.getByRole("button", { name: "Ouvrir le menu" });
  if (await menu.isVisible()) await menu.click();
}

export async function signUp(page: Page, plan?: string) {
  const email = `e2e-${randomUUID().slice(0, 8)}@essai.test`;
  const password = "une phrase de passe e2e solide";
  const since = new Date(Date.now() - 1000);
  await page.goto("/inscription");
  await page
    .getByLabel("Nom du cabinet")
    .fill("Cabinet vétérinaire de l'Essai");
  await page.getByLabel("Votre nom").fill("Dr Alix Essai");
  await page.getByLabel("Adresse e-mail professionnelle").fill(email);
  if (plan)
    await page.getByRole("radio", { name: new RegExp(`^${plan} ·`) }).check();
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

/** Connexion d'un vétérinaire : mot de passe, puis code reçu par e-mail (nouvel appareil). */
export async function loginWithCode(
  page: Page,
  email: string,
  password: string,
) {
  const since = new Date(Date.now() - 1000);
  await login(page, email, password);
  await expect(page).toHaveURL(/\/connexion\/code$/);
  await page
    .getByLabel("Code de sécurité")
    .fill(await securityCode(email, since));
  await page.getByRole("button", { name: "Valider le code" }).click();
  await expect(page).toHaveURL(/\/app$/);
}
