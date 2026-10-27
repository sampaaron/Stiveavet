import { expect, test } from "@playwright/test";

import { expectAccessible } from "./support/flows";

/**
 * Documents du cabinet (ADR 0045) : Claire ajoute une fiche PDF sous Protocoles, la
 * télécharge par un lien signé qui ne s'ouvre pas sans sa session, puis la supprime.
 * Un titre par projet : les deux projets partagent la même base.
 */
const PDF = Buffer.from(
  "%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n",
);

test("un document du cabinet s'ajoute, se télécharge et se supprime", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const title = `Consignes après détartrage (${testInfo.project.name})`;

  await page.goto("/app/protocoles");
  await page
    .getByRole("navigation", { name: "Onglets de la rubrique Protocoles" })
    .getByRole("link", { name: "Documents" })
    .click();
  await expect(page).toHaveURL(/\/app\/documents$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Documents" }),
  ).toBeVisible();
  await expect(page.getByText("Pas de dossier patient ici")).toBeVisible();

  // 1. Ajout : le type est relu par le serveur.
  await page.getByLabel("Titre").fill(title);
  await page
    .getByLabel("Catégorie")
    .selectOption({ label: "Fiche pour les propriétaires" });
  await page.getByLabel("Fichier", { exact: true }).setInputFiles({
    name: "consignes.pdf",
    mimeType: "application/pdf",
    buffer: PDF,
  });
  await page.getByRole("button", { name: "Ajouter le document" }).click();
  await expect(page).toHaveURL(/\?fait=ajout$/);
  await expect(
    page.getByRole("status").filter({ hasText: "Document ajouté." }),
  ).toBeVisible();
  const item = page.getByRole("listitem").filter({ hasText: title });
  await expect(item).toContainText("Fiche pour les propriétaires");
  await expect(item).toContainText("PDF");
  await expectAccessible(page);

  // 2. Téléchargement, jamais d'affichage, sous le titre du document.
  const link = item.getByRole("link", { name: `Télécharger ${title}` });
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^\/app\/documents\/[0-9a-f-]+\?e=\d+&s=[\w-]+$/);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    link.click(),
  ]);
  await download.cancel();
  const own = await page.request.get(href ?? "");
  expect(own.status()).toBe(200);
  // Nom vérifié dans l'en-tête : celui que propose le navigateur de test dépend de la langue
  // du système qui le fait tourner.
  const disposition = own.headers()["content-disposition"] ?? "";
  expect(disposition).toMatch(
    /^attachment; filename="Consignes apres detartrage \(/,
  );
  expect(decodeURIComponent(disposition.split("''")[1] ?? "")).toBe(
    `${title}.pdf`,
  );
  expect(own.headers()["cache-control"]).toContain("no-store");

  // 3. Sans session : rien. Lien altéré : retour à la liste, avec des liens neufs.
  const stranger = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const anonymous = await stranger.request.get(href ?? "", {
    maxRedirects: 0,
  });
  expect(anonymous.status()).toBe(404);
  await stranger.close();
  await page.goto(
    (href ?? "").replace(/s=([\w-])/, (_, first: string) =>
      first === "A" ? "s=B" : "s=A",
    ),
  );
  await expect(page).toHaveURL(/\/app\/documents\?lien=expire$/);
  await expect(
    page.getByRole("status").filter({ hasText: "Ce lien a expiré" }),
  ).toBeVisible();

  // 4. Suppression confirmée.
  await page
    .getByRole("listitem")
    .filter({ hasText: title })
    .getByRole("button", { name: `Supprimer ${title}` })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Supprimer le document" })
    .click();
  await expect(page).toHaveURL(/\?fait=suppression$/);
  await expect(
    page.getByRole("listitem").filter({ hasText: title }),
  ).toHaveCount(0);
  expect(
    (await page.request.get(href ?? "", { maxRedirects: 0 })).status(),
  ).toBe(307);
});
