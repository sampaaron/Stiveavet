import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("la page d'accueil s'affiche en français", async ({ page }) => {
  await page.goto("/fr");

  await expect(page).toHaveTitle(/^Stivea Vet · /);
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Vos patients suivis après l'intervention",
  );
});

test("chaque page porte une CSP stricte avec un nonce unique par requête", async ({
  request,
}) => {
  const first = (await request.get("/")).headers()["content-security-policy"];
  const second = (await request.get("/")).headers()["content-security-policy"];

  expect(first).toContain("frame-ancestors 'none'");
  expect(first).not.toContain("unsafe-eval");
  expect(first).toMatch(/'nonce-[^']+'/);
  expect(first).not.toBe(second);
});

test("aucun script ne viole la CSP au chargement", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /Content Security Policy/i.test(message.text())
    ) {
      violations.push(message.text());
    }
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  expect(violations).toEqual([]);
});

test("les en-têtes de sécurité sont présents, sans divulguer la technologie", async ({
  request,
}) => {
  const headers = (await request.get("/")).headers();

  expect(headers["strict-transport-security"]).toBeDefined();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("la sonde de santé répond sans rien révéler d'autre", async ({
  request,
}) => {
  const response = await request.get("/api/health");

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
  expect(response.headers()["cache-control"]).toContain("no-store");
});

test("aucune violation d'accessibilité sérieuse", async ({ page }) => {
  await page.goto("/");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );

  expect(serious).toEqual([]);
});
