import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const page_url = "/interne/design-system";

test("le catalogue ne présente aucune violation d'accessibilité sérieuse", async ({
  page,
}) => {
  await page.goto(page_url);

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );

  expect(
    serious.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
    ),
  ).toEqual([]);
});

test("chaque statut porte un libellé lisible, pas seulement une couleur", async ({
  page,
}) => {
  await page.goto(page_url);

  for (const label of [
    "Normal",
    "À surveiller",
    "Urgent",
    "En pause",
    "Accord en attente",
    "STOP reçu",
  ]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
});

test("Numa et Stive sont toujours présentés comme des IA", async ({ page }) => {
  await page.goto(page_url);

  await expect(page.getByText("Assistante IA")).toBeVisible();
  await expect(page.getByText("Assistant IA")).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Numa, assistante ia" }),
  ).toBeVisible();
});

test("la confirmation se pilote au clavier et rend le focus au déclencheur", async ({
  page,
}) => {
  await page.goto(page_url);
  const trigger = page.getByRole("button", { name: "Arrêter le suivi" });

  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", {
    name: "Arrêter le suivi de Caramel ?",
  });
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.getByText("Aucune action confirmée.")).toBeVisible();

  await trigger.click();
  await dialog.getByRole("button", { name: "Arrêter le suivi" }).click();
  await expect(
    page.getByText("Suivi arrêté (démonstration, rien n'est enregistré)."),
  ).toBeVisible();
});

test.describe("sur mobile", () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 1280) >= 1024,
    "menu mobile uniquement",
  );

  test("la navigation s'ouvre et se ferme depuis le bouton menu", async ({
    page,
  }) => {
    await page.goto(page_url);
    const nav = page.getByRole("navigation", { name: "Navigation principale" });

    await expect(nav).toBeHidden();
    await page.getByRole("button", { name: "Ouvrir le menu" }).click();
    await expect(nav).toBeVisible();
    await page.getByRole("button", { name: "Fermer le menu" }).click();
    await expect(nav).toBeHidden();
  });

  test("la page ne déborde jamais horizontalement à 320 px", async ({
    page,
  }) => {
    await page.goto(page_url);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
