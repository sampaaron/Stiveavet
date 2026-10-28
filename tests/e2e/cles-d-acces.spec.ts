import { expect, test } from "@playwright/test";

import { expectAccessible, openAccountMenu, signUp } from "./support/flows";
import { latestEmail } from "./support/mailpit";

/**
 * Clé d'accès (ADR 0050) avec l'authentificateur virtuel de Chromium : ajoutée dans
 * « Mon compte » mot de passe à l'appui, elle déverrouille la session sans le retaper,
 * puis, retirée, elle disparaît de la page verrouillée.
 */
test.describe("clé d'accès", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("ajoutée dans Mon compte, elle déverrouille la session", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "Un cabinet complet par exécution : un seul format d'écran.",
    );
    test.setTimeout(120_000);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });

    const { email, password } = await signUp(page, "Pro");
    const since = new Date(Date.now() - 1000);
    await page.goto("/app/compte");
    const section = page.locator("#cles-d-acces");
    await expect(
      section.getByText("Aucune clé d'accès : le mot de passe est demandé"),
    ).toBeVisible();

    // Mauvais mot de passe : rien n'est demandé à l'appareil.
    await section
      .getByLabel("Nom de la clé")
      .fill("Ordinateur de la consultation");
    await section.getByLabel("Votre mot de passe").fill("pas le bon");
    await section
      .getByRole("button", { name: "Ajouter une clé d'accès" })
      .click();
    await expect(section.getByText("Mot de passe incorrect.")).toBeVisible();

    await section.getByLabel("Votre mot de passe").fill(password);
    await section
      .getByRole("button", { name: "Ajouter une clé d'accès" })
      .click();
    await expect(
      section.getByText("Clé d'accès ajoutée. Un e-mail de confirmation"),
    ).toBeVisible();
    await expect(
      section.getByText("Ordinateur de la consultation", { exact: true }),
    ).toBeVisible();
    expect((await latestEmail(email, since)).Subject).toBe(
      "Une clé d'accès a été ajoutée à votre compte Stivea Vet",
    );
    await expectAccessible(page);

    // Verrouillée, la session se reprend d'un geste.
    await openAccountMenu(page);
    await page.getByRole("button", { name: "Verrouiller" }).click();
    await expect(page).toHaveURL(/\/verrouillage$/);
    await expectAccessible(page);
    await page
      .getByRole("button", { name: "Déverrouiller avec ma clé d'accès" })
      .click();
    await expect(page).toHaveURL(/\/app$/);

    await page.goto("/app/journal");
    await expect(
      page.getByText("Dr Alix Essai a ajouté une clé d'accès"),
    ).toBeVisible();

    // Retirée, elle n'apparaît plus : seul le mot de passe déverrouille.
    await page.goto("/app/compte");
    await section
      .getByRole("button", {
        name: "Retirer la clé d'accès Ordinateur de la consultation",
      })
      .click();
    // La ligne disparaît avec la clé ; la section revient à son état vide.
    await expect(
      section.getByText("Aucune clé d'accès : le mot de passe est demandé"),
    ).toBeVisible();
    await openAccountMenu(page);
    await page.getByRole("button", { name: "Verrouiller" }).click();
    await expect(page).toHaveURL(/\/verrouillage$/);
    await expect(
      page.getByRole("button", { name: "Déverrouiller avec ma clé d'accès" }),
    ).toHaveCount(0);
    await page.getByLabel("Mot de passe").fill(password);
    await page.getByRole("button", { name: "Déverrouiller" }).click();
    await expect(page).toHaveURL(/\/app$/);
  });
});
