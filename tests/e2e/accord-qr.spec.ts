import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { expectAccessible } from "./support/flows";

/**
 * Accord WhatsApp par QR code à l'accueil (ADR 0051), WhatsApp simulé : l'écran tourné vers le
 * propriétaire dit ce qu'il accepte, montre un QR code par propriétaire, puis note l'accord dès
 * que le message prêt arrive (ici, le bouton de simulation). Un animal par projet.
 */
const ANIMALS: Record<string, { name: string; owners: string[] }> = {
  desktop: { name: "Bambou", owners: ["Paul Leroy", "Anaïs Leroy"] },
  "mobile-320": { name: "Paprika", owners: ["Zoé Martin"] },
};

async function prepare(page: Page, animal: string, secondOwner?: string) {
  await page.goto("/app/suivis/nouveau");
  await page
    .getByLabel("Animal, propriétaire ou identifiant dr.veto")
    .fill(animal);
  await page.getByRole("button", { name: "Rechercher" }).click();
  await page
    .getByRole("button", { name: `Préparer la fiche de ${animal}` })
    .click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: `Fiche de lancement de ${animal}`,
    }),
  ).toBeVisible();
  if (!secondOwner) return;
  await page
    .getByRole("checkbox", {
      name: new RegExp(`Inclure ${secondOwner}, second propriétaire`),
    })
    .check();
  await page.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  await expect(page).toHaveURL(/\/lancement\?fait=enregistre$/);
}

test("le propriétaire donne son accord WhatsApp en scannant le QR code de l'accueil", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const animal = ANIMALS[testInfo.project.name];
  test.skip(!animal || testInfo.retry > 0, "Projet sans animal réservé");
  if (!animal) return;
  const { name, owners } = animal;

  await prepare(page, name, owners[1]);
  if (owners.length > 1) {
    // Depuis la fiche de lancement, à côté de la case.
    await page
      .getByRole("link", {
        name: "Montrer le QR code d'accord au propriétaire",
      })
      .click();
  } else {
    // Depuis « Prêts à lancer », sur la vue d'ensemble.
    await page.goto("/app");
    await page
      .getByRole("list", { name: "Prêts à lancer" })
      .getByRole("link", { name: `QR code d'accord : ${name}` })
      .click();
  }

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: `Accord WhatsApp pour le suivi de ${name}`,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Numa, l'assistante IA du cabinet"),
  ).toBeVisible();
  await expect(page.getByText("WhatsApp est simulé")).toBeVisible();
  for (const owner of owners)
    await expect(
      page.getByRole("img", {
        name: `QR code d'accord WhatsApp pour ${owner}`,
      }),
    ).toBeVisible();
  await expect(page.getByText(/^Code ACCORD-[A-Z0-9]{8}$/)).toHaveCount(
    owners.length,
  );
  await expectAccessible(page);

  for (const owner of owners)
    await page
      .getByRole("button", {
        name: `Simuler l'envoi depuis le téléphone de ${owner}`,
      })
      .click();
  await expect(
    page.getByText(
      owners.length > 1
        ? "Accord des deux propriétaires reçu : le suivi peut être lancé."
        : "Accord reçu : le suivi peut être lancé.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Accord reçu", { exact: true })).toHaveCount(
    owners.length,
  );

  // La case n'est plus à cocher sur la fiche du vétérinaire.
  await page
    .getByRole("link", { name: "Ouvrir la fiche de lancement" })
    .click();
  await expect(
    page.getByText(
      owners.length > 1
        ? "Accord WhatsApp des propriétaires déjà noté au cabinet."
        : "Accord WhatsApp du propriétaire déjà noté au cabinet.",
    ),
  ).toBeVisible();

  await page.goto("/app/journal");
  await expect(
    page
      .getByText(
        "Le propriétaire a donné son accord pour WhatsApp par le QR code affiché par Dr Claire Fontaine",
      )
      .first(),
  ).toBeVisible();
});
