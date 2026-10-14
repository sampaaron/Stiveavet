import { expect, test } from "@playwright/test";

import { expectAccessible } from "./support/flows";
import { OPT_IN } from "./support/suivis";

/**
 * Registre des animaux (MVP) : enregistrer un animal et son propriétaire, puis lancer un
 * suivi depuis sa fiche, sans dr.veto. Chaque projet et chaque tentative a son animal.
 */
const ANIMALS: Record<string, { name: string; phone: string }[]> = {
  desktop: [
    { name: "Noisette", phone: "06 70 00 00 11" },
    { name: "Cannelle", phone: "06 70 00 00 12" },
  ],
  "mobile-320": [
    { name: "Myrtille", phone: "06 70 00 00 21" },
    { name: "Pistache", phone: "06 70 00 00 22" },
  ],
};

test("une vétérinaire enregistre un animal puis lance son suivi en quelques clics", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const animal = ANIMALS[testInfo.project.name]?.[testInfo.retry];
  test.skip(!animal, "Projet sans animal réservé");
  if (!animal) return;

  await page.goto("/app/animaux");
  await expect(
    page.getByRole("heading", { level: 1, name: "Animaux" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Nouvel animal" }).first().click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Nouvel animal" }),
  ).toBeVisible();

  await page.getByLabel("Nom", { exact: true }).fill(animal.name);
  await page.getByLabel("Espèce").selectOption("cat");
  await page.getByLabel("Race").fill("Européen");
  await page.getByLabel("Sexe").selectOption("female");
  await page.getByLabel("Nom et prénom").fill("Inès Fictive");
  // Numéro invalide : refusé, la saisie reste en place.
  await page.getByLabel("Numéro WhatsApp").fill("12");
  await page.getByRole("button", { name: "Enregistrer l'animal" }).click();
  await expect(
    page.getByText(/Numéro invalide : un portable français/),
  ).toBeVisible();
  await expect(page.getByLabel("Nom", { exact: true })).toHaveValue(
    animal.name,
  );
  await page.getByLabel("Numéro WhatsApp").fill(animal.phone);
  await page.getByRole("button", { name: "Enregistrer l'animal" }).click();

  // Fiche de l'animal : numéro masqué, formulaire de lancement.
  await expect(
    page.getByRole("heading", { level: 1, name: animal.name }),
  ).toBeVisible();
  await expect(
    page.getByText(`•• •• •• •• ${animal.phone.slice(-2)}`),
  ).toBeVisible();
  await expectAccessible(page);

  await page
    .getByLabel("Intervention", { exact: true })
    .fill("Stérilisation de la chatte");
  await page
    .getByRole("button", { name: "Préparer la fiche de lancement" })
    .click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: `Fiche de lancement de ${animal.name}`,
    }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: OPT_IN }).check();
  await page.getByRole("button", { name: "Lancer le suivi" }).click();
  await expect(page).toHaveURL(/\/app\/suivis\/[0-9a-f-]+\?fait=lance$/);

  // Le registre montre le suivi en cours ; la fiche en garde l'historique.
  await page.goto(`/app/animaux?q=${animal.name}`);
  await expect(page.getByText("Suivi en cours").first()).toBeVisible();
  await page
    .getByRole("link", { name: `Ouvrir la fiche de ${animal.name}` })
    .click();
  await expect(
    page.getByRole("heading", { name: "Historique des suivis" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Un suivi est en cours" }),
  ).toBeVisible();

  await page.goto("/app/journal");
  await expect(
    page.getByText("a enregistré un animal dans le registre").first(),
  ).toBeVisible();
  await expect(
    page.getByText("a préparé un suivi depuis le registre du cabinet").first(),
  ).toBeVisible();
});
