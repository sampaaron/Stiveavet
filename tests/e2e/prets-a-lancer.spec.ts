import { expect, test } from "@playwright/test";

import { expectAccessible } from "./support/flows";
import { OPT_IN } from "./support/suivis";

/**
 * Prêts à lancer (ADR 0046) : la fiche est préparée et l'accord noté, puis la vétérinaire
 * responsable lance depuis la vue d'ensemble en un clic, traitement importé validé du même
 * geste. Un animal par projet : un animal n'a qu'un suivi ouvert à la fois.
 */
const ANIMALS: Record<string, string> = {
  desktop: "Brindille",
  "mobile-320": "Réglisse",
};

test("une fiche préparée se lance en un clic depuis la vue d'ensemble", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const animal = ANIMALS[testInfo.project.name];
  test.skip(!animal || testInfo.retry > 0, "Projet sans animal réservé");
  if (!animal) return;

  // 1. Fiche préparée depuis dr.veto (simulé), accord WhatsApp noté au cabinet.
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
  const sheet = page.url().replace(/\?.*$/, "");

  // Les traitements importés se valident en une fois (la décision part avec la fiche).
  const treatment = page.getByRole("checkbox", {
    name: /^Je valide ce traitement/,
  });
  await expect(treatment).not.toBeChecked();
  await page
    .getByRole("button", { name: "Valider le traitement importé" })
    .click();
  await expect(treatment).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Valider le traitement importé" }),
  ).toHaveCount(0);
  // Ici, la validation est laissée à la vue d'ensemble.
  await treatment.uncheck();
  await page.getByRole("checkbox", { name: OPT_IN }).check();
  await page.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  await expect(page).toHaveURL(/\/lancement\?fait=enregistre$/);
  // Accord déjà noté : plus de case à cocher.
  await expect(
    page.getByText("Accord WhatsApp du propriétaire déjà noté au cabinet."),
  ).toBeVisible();
  await expect(page.getByRole("checkbox", { name: OPT_IN })).toHaveCount(0);

  // 2. Vue d'ensemble : la carte reprend ce que la vétérinaire relit avant de lancer.
  await page.goto("/app");
  const queue = page.getByRole("list", { name: "Prêts à lancer" });
  const card = queue.getByRole("listitem").filter({ hasText: animal }).first();
  await expect(card).toContainText("Protocole « Stérilisation de la chatte »");
  await expect(card).toContainText(
    "1 traitement importé de dr.veto, validé en lançant",
  );
  await expect(card).toContainText("Anti-inflammatoire (exemple fictif)");
  await expect(page.getByText(/gagnées sur 30 jours/)).toBeVisible();
  await expectAccessible(page);

  await card
    .getByRole("button", {
      name: `Valider le traitement et lancer : ${animal}`,
    })
    .click();
  await expect(page).toHaveURL(/\/app\?lances=1&echecs=0$/);
  await expect(
    page.getByRole("status").filter({ hasText: "1 suivi lancé" }),
  ).toBeVisible();
  await expect(
    queue.getByRole("listitem").filter({ hasText: animal }),
  ).toHaveCount(0);

  // 3. Le suivi est lancé, le traitement validé au nom de la vétérinaire.
  await page.goto(sheet);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: `Modifier le suivi de ${animal}`,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/Validé par Dr Claire Fontaine/).first(),
  ).toBeVisible();
});
