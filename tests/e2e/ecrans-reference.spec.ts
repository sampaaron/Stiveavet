import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const caramel = "/app/suivis/3f6b2a9e-1c4d-4e8a-9b51-7a0c2d5e8f11";

async function expectAccessible(page: Page) {
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
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("tableau de bord « Aujourd'hui »", () => {
  test("place l'urgence avant les chiffres et mène au dossier", async ({
    page,
  }) => {
    await page.goto("/app");

    await expect(
      page.getByRole("heading", { level: 1, name: "Bonjour Claire" }),
    ).toBeVisible();
    // Le bandeau des alertes réelles (lot 14) peut précéder la carte de référence.
    const alert = page.getByRole("alert").filter({ hasText: "Caramel" });
    await expect(alert).toBeVisible();

    await alert.getByRole("link", { name: "Ouvrir le dossier" }).click();
    await expect(page).toHaveURL(caramel);
    await expect(
      page.getByRole("heading", { level: 1, name: "Caramel" }),
    ).toBeVisible();
  });

  test("affiche le compteur de capacité des suivis actifs", async ({
    page,
  }) => {
    await page.goto("/app");

    await expect(
      page.getByRole("meter", { name: "Suivis actifs" }),
    ).toHaveAttribute("aria-valuenow", "7");
    await expect(page.getByText("3 places incluses restantes")).toBeVisible();
  });

  test("identifie les rendez-vous Stivea dans l'agenda", async ({ page }) => {
    await page.goto("/app");

    const moka = page.getByRole("link", {
      name: /Contrôle post-opératoire · Moka/,
    });
    await expect(moka).toContainText("Stivea");
  });

  test("marque « Aujourd'hui » comme page courante", async ({ page }) => {
    await page.goto("/app");
    const nav = page.getByRole("navigation", { name: "Navigation principale" });
    if (!(await nav.isVisible()))
      await page.getByRole("button", { name: "Ouvrir le menu" }).click();

    await expect(
      nav.getByRole("link", { name: "Aujourd'hui" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("reste accessible et sans débordement horizontal", async ({ page }) => {
    await page.goto("/app");

    await expectAccessible(page);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("dossier animal et conversation Numa", () => {
  test("montre la synthèse, le consentement et le cadre de Numa", async ({
    page,
  }) => {
    await page.goto(caramel);

    await expect(
      page.getByRole("heading", { name: "Synthèse pré-consultation" }),
    ).toBeVisible();
    await expect(page.getByText("Accord donné", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Accord en attente", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/Numa est une IA : elle ne pose pas de diagnostic/),
    ).toBeVisible();
    await expect(page.getByText(/je suis Numa, l'assistante IA/)).toBeVisible();
  });

  test("écrire au propriétaire met Numa en pause jusqu'à « Reprendre Numa »", async ({
    page,
  }) => {
    await page.goto(caramel);

    await page
      .getByLabel("Écrire à Julien")
      .fill("Je vous rappelle dans 5 minutes.");
    await page.getByRole("button", { name: "Envoyer" }).click();

    await expect(
      page.getByText("Je vous rappelle dans 5 minutes."),
    ).toBeVisible();
    await expect(
      page.getByText("Vous avez repris la main : Numa est en pause"),
    ).toBeVisible();

    await page.getByRole("button", { name: "Reprendre Numa" }).click();
    await expect(page.getByText("Numa suit la conversation")).toBeVisible();
  });

  test("l'accusé de réception remplace l'alerte urgente", async ({ page }) => {
    await page.goto(caramel);

    await page.getByRole("button", { name: "Accuser réception" }).click();
    await expect(
      page.getByText("Réception de l'urgence confirmée par Dr Fontaine"),
    ).toBeVisible();
  });

  test("un identifiant inconnu ne révèle rien", async ({ page }) => {
    const response = await page.goto(
      "/app/suivis/00000000-0000-4000-8000-000000000000",
    );

    expect(response?.status()).toBe(404);
    await expect(
      page.getByText("Cet écran n'est pas encore disponible"),
    ).toBeVisible();
  });

  test("reste accessible et sans débordement horizontal", async ({ page }) => {
    await page.goto(caramel);

    await expectAccessible(page);
    await expectNoHorizontalOverflow(page);
  });
});
