import { randomUUID } from "node:crypto";

import { expect, test } from "./support/test";

import { expectAccessible } from "./support/flows";

/**
 * Étape 3 du plan « Faire gagner du temps au vétérinaire » (ADR 0048) : la boîte « À traiter »,
 * la synthèse prête le jour du contrôle avec « Copier pour dr.veto », et les réponses prêtes
 * posées dans la zone de saisie sans jamais partir seules.
 */

test("la vue d'ensemble réunit ce qui est à traiter et prépare les contrôles du jour", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/app");

  const inbox = page.getByRole("list", { name: "À traiter" });
  const caramel = inbox.getByRole("listitem").filter({ hasText: "Caramel" });
  await expect(caramel).toContainText("Urgence signalée");
  await expect(
    caramel.getByRole("link", { name: "Répondre : Caramel" }),
  ).toBeVisible();
  // L'urgence reste en tête de la boîte.
  await expect(inbox.getByRole("listitem").first()).toContainText("Urgence");

  // Le point du jour annonce les contrôles et mène à leurs synthèses.
  await page
    .getByRole("link", { name: /contrôles? aujourd'hui : synthèses prêtes/ })
    .click();
  const controls = page.getByRole("list", { name: "Contrôles du jour" });
  const moka = controls.getByRole("listitem").filter({ hasText: "Moka" });
  await moka.getByText("Lire la synthèse").click();
  await moka
    .getByRole("button", { name: "Copier pour dr.veto : synthèse de Moka" })
    .click();
  await expect(moka.getByRole("status")).toContainText("Synthèse copiée");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^Stivea Vet · Suivi de Moka/);
  expect(copied).toContain("préparée par l'IA de Stivea Vet");
  await expectAccessible(page);
});

test("une réponse prête se pose dans la zone de saisie, sans partir", async ({
  page,
}) => {
  await page.goto("/app");
  await page
    .getByRole("list", { name: "À traiter" })
    .getByRole("link", { name: "Répondre : Caramel" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Caramel" }),
  ).toBeVisible();

  const ready = page.getByRole("group", { name: "Réponses prêtes" });
  const field = page.getByRole("textbox", { name: /^Écrire à / });
  await ready.getByRole("button", { name: "Message bien reçu" }).click();
  await expect(field).toHaveValue(
    /^Bonjour .+, c'est Dr Claire Fontaine\. Merci pour votre message au sujet de Caramel/,
  );
  await expect(field).toBeFocused();
  await expect(
    page.getByText(/« Message bien reçu » posé dans la zone/),
  ).toBeVisible();

  // Les phrases d'organisation de Stive, présentées comme venant d'une IA.
  await ready
    .getByRole("button", {
      name: "Demander une photo (préparée par Stive, assistant IA)",
    })
    .click();
  await expect(field).toHaveValue(/photo récente de Caramel/);
  await expect(
    page.getByRole("status").filter({ hasText: "« Demander une photo » posé" }),
  ).toContainText("Assistant IA");
});

test("l'administratrice écrit les modèles de réponse du cabinet", async ({
  page,
}, testInfo) => {
  const title = `Modèle e2e ${testInfo.project.name} ${randomUUID().slice(0, 6)}`;
  await page.goto("/app/reponses");
  await expect(
    page.getByRole("heading", { level: 1, name: "Réponses prêtes" }),
  ).toBeVisible();
  await expectAccessible(page);

  const add = page.getByRole("form", { name: "Ajouter un modèle" });
  await add.getByLabel("Nom du modèle").fill(title);
  await add.getByLabel("Texte").fill("Bonjour {proprietaire}, à bientôt.");
  await add.getByRole("button", { name: "Ajouter le modèle" }).click();
  await expect(page).toHaveURL(/\/app\/reponses\?fait=ajout$/);
  const list = page.getByRole("list", { name: "Réponses prêtes" });
  const item = list.getByRole("listitem").filter({ hasText: title });
  await expect(item).toHaveCount(1);

  await page.getByRole("button", { name: `Supprimer ${title}` }).click();
  await page.getByRole("button", { name: "Supprimer le modèle" }).click();
  await expect(page).toHaveURL(/\/app\/reponses\?fait=suppression$/);
  await expect(item).toHaveCount(0);
});
