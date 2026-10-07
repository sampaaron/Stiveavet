import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { LEA, PHRASE } from "./support/accounts";
import { expectAccessible, login } from "./support/flows";

/**
 * Lancement manuel d'un suivi depuis dr.veto simulé (lot 12). Chaque projet (ordinateur,
 * 320 px) et chaque nouvelle tentative prend un animal différent : un animal n'a qu'un suivi
 * ouvert à la fois.
 */
const ANIMALS: Record<string, { name: string; phoneEnd: string }[]> = {
  desktop: [
    { name: "Praline", phoneEnd: "07" },
    { name: "Gaston", phoneEnd: "02" },
  ],
  "mobile-320": [
    { name: "Sésame", phoneEnd: "04" },
    { name: "Biscotte", phoneEnd: "06" },
  ],
};

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("une vétérinaire lance, modifie, met en pause, reprend et arrête un suivi", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const animal = ANIMALS[testInfo.project.name]?.[testInfo.retry];
  test.skip(!animal, "Projet sans animal réservé");
  if (!animal) return;

  // 1. Recherche dans dr.veto (simulé).
  await page.goto("/app/suivis");
  await page.getByRole("link", { name: "Lancer un suivi" }).first().click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Lancer un suivi" }),
  ).toBeVisible();
  await page
    .getByLabel("Animal, propriétaire ou identifiant dr.veto")
    .fill(animal.name);
  await page.getByRole("button", { name: "Rechercher" }).click();
  await page
    .getByRole("button", { name: `Préparer la fiche de ${animal.name}` })
    .click();

  // 2. Fiche de lancement : résumé en lecture seule, numéro masqué.
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: `Fiche de lancement de ${animal.name}`,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Lecture seule · import du/)).toBeVisible();
  await expect(
    page
      .getByText(`WhatsApp •• •• •• •• ${animal.phoneEnd}`, { exact: false })
      .first(),
  ).toBeVisible();
  await expect(page.getByText("+336399801")).toHaveCount(0);
  await expect(
    page.getByText("Importé de dr.veto, à valider").first(),
  ).toBeVisible();
  await expectAccessible(page);
  await expectNoHorizontalOverflow(page);

  // Premier message choisi librement, traitement validé, puis lancement.
  await page.getByLabel("Heures après l'intervention").fill("4");
  await page
    .getByLabel(/^Je valide ce traitement/)
    .first()
    .check();
  await page.getByRole("button", { name: "Lancer le suivi" }).click();
  await expect(page).toHaveURL(/\/app\/suivis\/[0-9a-f-]+\?fait=lance$/);
  await expect(page.getByRole("status").first()).toContainText("Suivi lancé");
  await expect(
    page.getByRole("heading", { name: "Pilotage du suivi" }),
  ).toBeVisible();
  const dossier = page.url().replace(/\?.*$/, "");

  // 3. Modification d'un suivi en cours.
  await page.getByRole("link", { name: "Modifier le suivi" }).click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: `Modifier le suivi de ${animal.name}`,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Version figée au lancement/)).toBeVisible();
  await expect(
    page.getByText(/Validé par Dr Claire Fontaine/).first(),
  ).toBeVisible();
  await page
    .getByLabel("Signe d'alerte 1", { exact: true })
    .fill("Saignement qui ne s'arrête pas");
  await page
    .getByRole("button", { name: "Enregistrer les modifications" })
    .click();
  await expect(page).toHaveURL(/\/lancement\?fait=enregistre$/);
  await expect(
    page.getByLabel("Signe d'alerte 1", { exact: true }),
  ).toHaveValue("Saignement qui ne s'arrête pas");
  await expectNoHorizontalOverflow(page);

  // 4. Pause, reprise et arrêt, chacun confirmé.
  await page.goto(dossier);
  await page.getByRole("button", { name: "Mettre en pause" }).click();
  await expect(page).toHaveURL(/\?fait=pause$/);
  await page.getByRole("button", { name: "Reprendre le suivi" }).click();
  await expect(page).toHaveURL(/\?fait=reprise$/);
  await page.getByRole("button", { name: "Arrêter le suivi" }).click();
  await page.getByRole("button", { name: "Confirmer l'arrêt" }).click();
  await expect(page).toHaveURL(/\?fait=arret$/);
  await expect(page.getByRole("status").first()).toContainText("Suivi arrêté");
  await expect(
    page.getByRole("button", { name: "Réactiver le suivi" }),
  ).toBeVisible();

  // 5. Chaque décision est au journal.
  await page.goto("/app/journal");
  for (const sentence of [
    "a préparé un suivi depuis dr.veto",
    "a validé des traitements importés",
    "a lancé un suivi",
    "a modifié la fiche d'un suivi",
    "a mis un suivi en pause",
    "a repris un suivi",
    "a arrêté un suivi",
  ])
    await expect(page.getByText(sentence).first()).toBeVisible();
});

test("une assistante sans droit de lancement ne voit ni la recherche ni le bouton", async ({
  browser,
}) => {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await login(page, LEA, PHRASE);
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/app/suivis");
  await expect(page.getByRole("link", { name: "Lancer un suivi" })).toHaveCount(
    0,
  );
  const response = await page.goto("/app/suivis/nouveau?q=plume");
  expect(response?.status()).toBe(404);
  await context.close();
});
