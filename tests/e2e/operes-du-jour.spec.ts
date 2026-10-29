import { expect, test } from "./support/test";

import { expectAccessible } from "./support/flows";

/**
 * Opérés du jour (ADR 0047) : la vétérinaire prépare en un clic la fiche d'un animal opéré par
 * un confrère, qui en devient responsable ; l'accord WhatsApp est noté depuis la vue
 * d'ensemble, et la fiche attend que ce confrère la lance. Un animal par projet.
 */
const ANIMALS: Record<string, string> = {
  desktop: "Câline",
  "mobile-320": "Pépite",
};

test("une fiche se prépare depuis les opérés du jour et attend son responsable", async ({
  page,
}, testInfo) => {
  const animal = ANIMALS[testInfo.project.name];
  test.skip(!animal || testInfo.retry > 0, "Projet sans animal réservé");
  if (!animal) return;

  await page.goto("/app");
  const operated = page.getByRole("list", { name: "Opérés du jour" });
  const row = operated.getByRole("listitem").filter({ hasText: animal });
  await expect(row).toContainText("Ovariectomie");
  await expect(row).toContainText("par Dr Hugo Marchal");
  // Les suivis sans signe d'alerte restent repliés.
  await expect(page.getByText(/suivis? : rien à signaler/)).toBeVisible();
  await expectAccessible(page);

  await row
    .getByRole("button", { name: `Préparer la fiche : ${animal}` })
    .click();
  await expect(page).toHaveURL(/\/app\?preparees=1#prets-a-lancer$/);
  await expect(
    page.getByRole("status").filter({ hasText: "1 fiche préparée" }),
  ).toBeVisible();
  await expect(row).toContainText("Fiche prête à lancer");

  const card = page
    .getByRole("list", { name: "Prêts à lancer" })
    .getByRole("listitem")
    .filter({ hasText: animal })
    .first();
  await expect(card).toContainText("Accord WhatsApp du propriétaire à noter");
  await card
    .getByRole("button", { name: `Noter l'accord du propriétaire : ${animal}` })
    .click();
  await expect(page).toHaveURL(/\/app\?accord=1#prets-a-lancer$/);
  await expect(
    page.getByRole("status").filter({ hasText: "Accord WhatsApp noté." }),
  ).toBeVisible();
  // Responsable d'office : le vétérinaire qui a opéré. Seul lui lance.
  await expect(card).toContainText("Prête, attend Dr Hugo Marchal");
  await expect(card.getByRole("button", { name: /lancer/i })).toHaveCount(0);
});
