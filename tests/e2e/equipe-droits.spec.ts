import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";

import { HUGO, LEA, PHRASE } from "./support/accounts";
import {
  expectAccessible,
  login,
  loginWithCode,
  openAccountMenu,
  signUp,
} from "./support/flows";
import { latestEmail } from "./support/mailpit";

const CARAMEL = "/app/suivis/3f6b2a9e-1c4d-4e8a-9b51-7a0c2d5e8f11";
const OSCAR = "/app/suivis/d7b3e6c0-4a19-4f2e-8c5d-6e0a1b9f4c78";
const NOT_FOUND = "Cet écran n'est pas encore disponible";

/** Navigateur vierge, pour se connecter avec un autre compte que Claire. */
async function freshPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  return context.newPage();
}

async function expectNotFound(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status()).toBe(404);
  await expect(page.getByText(NOT_FOUND)).toBeVisible();
}

test.describe("assistant (Léa)", () => {
  test("voit l'organisation des suivis, jamais les données cliniques", async ({
    browser,
  }) => {
    const page = await freshPage(browser);
    await login(page, LEA, PHRASE);
    await expect(page).toHaveURL(/\/app$/);

    // Tableau de bord : pas d'urgence ni de conversation, seulement l'organisation.
    await expect(
      page.getByRole("heading", { name: "Suivis du cabinet" }),
    ).toBeVisible();
    await expect(page.getByText("Urgent", { exact: true })).toHaveCount(0);

    await page.goto("/app/suivis");
    await expect(page.getByRole("link", { name: /Caramel/ })).toBeVisible();
    await expect(page.getByText("Urgent", { exact: true })).toHaveCount(0);
    await expectAccessible(page);

    await page.goto(CARAMEL);
    await expect(
      page.getByRole("heading", { level: 1, name: "Caramel" }),
    ).toBeVisible();
    await expect(page.getByText("Données cliniques réservées")).toBeVisible();
    await expect(page.getByText("Synthèse pré-consultation")).toHaveCount(0);
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expectAccessible(page);

    // Écrans d'administration : inexistants pour elle, et absents du menu.
    await expectNotFound(page, "/app/equipe");
    await expectNotFound(page, "/app/journal");
    await page.goto("/app");
    await openAccountMenu(page);
    await expect(
      page.getByRole("link", { name: "Équipe et droits" }),
    ).toHaveCount(0);
  });
});

test.describe("vétérinaire (Hugo) et partage", () => {
  test("ne voit que ses suivis, puis un dossier partagé jusqu'au retrait", async ({
    page,
    browser,
  }) => {
    // Modifie les partages d'un dossier du cabinet de démonstration : une seule largeur.
    test.skip(
      test.info().project.name !== "desktop",
      "parcours avec écriture, joué une fois",
    );
    const hugo = await freshPage(browser);
    await loginWithCode(hugo, HUGO, PHRASE);
    await hugo.goto("/app/suivis");
    await expect(hugo.getByRole("link", { name: /Nala/ })).toBeVisible();
    await expect(hugo.getByRole("link", { name: /Caramel/ })).toHaveCount(0);
    await expectNotFound(hugo, CARAMEL);
    await expectNotFound(hugo, OSCAR);

    // Claire, responsable d'Oscar, partage le dossier avec Hugo pour 7 jours.
    await page.goto(OSCAR);
    await page
      .getByLabel("Vétérinaire")
      .selectOption({ label: "Dr Hugo Marchal" });
    await page.getByLabel("Durée").selectOption({ label: "7 jours" });
    await page.getByRole("button", { name: "Partager le dossier" }).click();
    await expect(page.getByText("Dossier partagé.")).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Retirer le partage avec Dr Hugo Marchal",
      }),
    ).toBeVisible();

    await hugo.goto(OSCAR);
    await expect(
      hugo.getByRole("heading", { level: 1, name: "Oscar" }),
    ).toBeVisible();
    // Un confrère invité ne gère pas l'accès au dossier.
    await expect(hugo.getByText("Accès au dossier")).toHaveCount(0);

    await page
      .getByRole("button", { name: "Retirer le partage avec Dr Hugo Marchal" })
      .click();
    await expect(page.getByText("Aucun partage.")).toBeVisible();
    await expectNotFound(hugo, OSCAR);
  });
});

test.describe("invitation d'un membre", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("l'administrateur invite, la personne crée son compte, puis perd l'accès", async ({
    page,
    browser,
  }) => {
    await signUp(page);
    await page.goto("/app/equipe");
    await expect(
      page.getByRole("heading", { level: 1, name: "Équipe et droits" }),
    ).toBeVisible();

    const email = `invite-${randomUUID().slice(0, 8)}@essai.test`;
    const since = new Date(Date.now() - 1000);
    await page.getByLabel("Nom", { exact: true }).fill("Sam Essai");
    await page.getByLabel("Adresse e-mail").fill(email);
    await page
      .getByLabel("Rôle", { exact: true })
      .selectOption({ label: "Assistant vétérinaire" });
    await page.getByRole("button", { name: "Envoyer l'invitation" }).click();
    await expect(page.getByText("Invitation envoyée.")).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await expectAccessible(page);

    const { Text } = await latestEmail(email, since);
    const link = /\/invitation\?jeton=[\w-]+/.exec(Text)?.[0];
    expect(link).toBeTruthy();

    const guest = await freshPage(browser);
    await guest.goto(link ?? "");
    await expect(guest.getByLabel("Adresse e-mail")).toHaveValue(email);
    await expectAccessible(guest);
    const password = "une phrase de passe invitee";
    await guest.getByLabel("Mot de passe", { exact: true }).fill(password);
    await guest.getByLabel("Confirmer le mot de passe").fill(password);
    await guest.getByRole("button", { name: "Créer mon compte" }).click();
    await expect(guest).toHaveURL(/\/connexion\?raison=invitation$/);

    // Le lien ne sert qu'une fois.
    await guest.goto(link ?? "");
    await expect(
      guest.getByText("Cette invitation n'est plus valable."),
    ).toBeVisible();

    await login(guest, email, password);
    await expect(guest).toHaveURL(/\/app$/);

    await page.reload();
    await page
      .getByRole("button", { name: "Retirer l'accès de Sam Essai" })
      .click();
    await expect(
      page.getByRole("button", { name: "Rétablir l'accès de Sam Essai" }),
    ).toBeVisible();

    // Sa session tombe immédiatement : la base refuse la suite.
    await guest.goto("/app");
    await expect(guest).toHaveURL(/\/connexion/);

    await page.goto("/app/journal");
    await expect(
      page.getByText(
        "Sam Essai a rejoint le cabinet sur invitation de Dr Alix Essai",
      ),
    ).toBeVisible();
    await expect(
      page.getByText("Dr Alix Essai a retiré l'accès de Sam Essai"),
    ).toBeVisible();
  });
});
