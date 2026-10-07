import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";

import { expectAccessible } from "./support/flows";
import { latestEmail } from "./support/mailpit";

// Le site public se visite sans compte.
test.use({ storageState: { cookies: [], origins: [] } });

const PAGES = [
  ["/fr", "/en"],
  ["/fr/fonctionnement", "/en/how-it-works"],
  ["/fr/numa", "/en/numa"],
  ["/fr/stive", "/en/stive"],
  ["/fr/integrations", "/en/integrations"],
  ["/fr/tarifs", "/en/pricing"],
  ["/fr/securite", "/en/security"],
  ["/fr/aide", "/en/help"],
  ["/fr/statut", "/en/status"],
  ["/fr/essai", "/en/trial"],
  ["/fr/demo", "/en/demo"],
  ["/fr/conditions", "/en/terms"],
  ["/fr/confidentialite", "/en/privacy"],
  ["/fr/desinscription", "/en/unsubscribe"],
] as const;

async function freshPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  return context.newPage();
}

test.describe("pages du site", () => {
  for (const [french, english] of PAGES) {
    test(`${french} et ${english} : langue, titre, accessibilité`, async ({
      page,
    }) => {
      for (const [path, lang] of [
        [french, "fr"],
        [english, "en"],
      ] as const) {
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute("lang", lang);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page).toHaveTitle(/Stivea Vet/);
        await expectAccessible(page);
      }
    });
  }

  test("le lien de langue mène à la même page dans l'autre langue", async ({
    page,
  }) => {
    await page.goto("/fr/tarifs");
    await page
      .getByRole("link", { name: "Read this page in English" })
      .first()
      .click();
    await expect(page).toHaveURL(/\/en\/pricing$/);
    await page
      .getByRole("link", { name: "Lire cette page en français" })
      .first()
      .click();
    await expect(page).toHaveURL(/\/fr\/tarifs$/);
  });

  test("l'accueil choisit la langue du navigateur, le français par défaut", async ({
    browser,
  }) => {
    const english = await browser.newContext({ locale: "en-GB" });
    const page = await english.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/en$/);
    await english.close();

    for (const locale of ["fr-FR", "de-DE"]) {
      const other = await browser.newContext({ locale });
      const otherPage = await other.newPage();
      await otherPage.goto("/");
      await expect(otherPage).toHaveURL(/\/fr$/);
      await other.close();
    }
  });

  test("une langue ou une page inconnue n'existe pas", async ({ page }) => {
    expect((await page.goto("/de"))?.status()).toBe(404);
    expect((await page.goto("/fr/pricing"))?.status()).toBe(404);
  });

  test("accueil : appel principal, Numa et Stive présentés comme des IA", async ({
    page,
  }) => {
    await page.goto("/fr");
    await expect(
      page.getByRole("link", { name: "Commencer l'essai à 86 € HT" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Numa, Assistante IA" }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Stive, Assistant IA" }),
    ).toBeVisible();
    await expect(page.getByText("Conversation fictive")).toBeVisible();
  });

  test("tarifs : les prix HT du cahier des charges", async ({ page }) => {
    await page.goto("/fr/tarifs");
    for (const price of ["109 €", "149 €", "216 €", "279 €", "139 €", "309 €"])
      await expect(
        page.getByText(price, { exact: true }).first(),
      ).toBeVisible();
    await expect(page.getByText("Plus de 3 vétérinaires")).toBeVisible();
    await expect(page.getByText(/2,50\s€ HT/)).toBeVisible();
    await expect(page.getByText(/1,26\s€ HT/)).toBeVisible();
  });

  test("intégrations : seuls dr.veto et WhatsApp au lancement", async ({
    page,
  }) => {
    await page.goto("/fr/integrations");
    await expect(page.getByText("Au lancement", { exact: true })).toHaveCount(
      2,
    );
    await expect(
      page.getByText("Bientôt disponible", { exact: true }),
    ).toHaveCount(2);
  });

  test("conditions et confidentialité sont signalées comme des projets", async ({
    page,
  }) => {
    for (const path of ["/fr/conditions", "/fr/confidentialite"]) {
      await page.goto(path);
      await expect(
        page.getByText(/à faire valider par un juriste/),
      ).toBeVisible();
    }
  });

  test("l'essai mène à l'inscription, qui exige conditions et autorisation", async ({
    page,
  }) => {
    await page.goto("/fr/essai");
    await page.getByRole("link", { name: "Créer mon cabinet" }).click();
    await expect(page).toHaveURL(/\/inscription$/);
    await page.getByLabel("Nom du cabinet").fill("Cabinet sans case");
    await page.getByLabel("Votre nom").fill("Dr Sans Case");
    await page
      .getByLabel("Adresse e-mail professionnelle")
      .fill(`sans-case-${randomUUID().slice(0, 8)}@essai.test`);
    await page
      .getByLabel("Mot de passe", { exact: true })
      .fill("une phrase de passe e2e solide");
    await page
      .getByLabel("Confirmer le mot de passe")
      .fill("une phrase de passe e2e solide");
    await page.getByRole("button", { name: "Créer le cabinet" }).click();
    await expect(
      page.getByText("Acceptez les conditions d'utilisation pour continuer."),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Confirmez que vous êtes autorisé à souscrire au nom du cabinet.",
      ),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/inscription$/);
  });
});

test.describe("démo", () => {
  test("sans demande, la démo n'est pas accessible", async ({ page }) => {
    await page.goto("/fr/demo/espace");
    await expect(page).toHaveURL(/\/fr\/demo\?acces=expire$/);
    await expect(
      page.getByText(/Votre accès à la démo a expiré/),
    ).toBeVisible();
  });

  test("le formulaire signale les champs manquants", async ({ page }) => {
    await page.goto("/fr/demo");
    await page.getByRole("button", { name: "Ouvrir la démo" }).click();
    await expect(
      page.getByText("Saisissez une adresse e-mail valide."),
    ).toBeVisible();
    await expect(page.getByText("Indiquez le nom du cabinet.")).toBeVisible();
    await expect(
      page.getByText("Choisissez le nombre de vétérinaires."),
    ).toBeVisible();
  });

  test("demande, démo en lecture seule, e-mail et désinscription", async ({
    page,
    browser,
  }) => {
    test.skip(
      test.info().project.name !== "desktop",
      "parcours avec e-mail : une fois suffit",
    );
    const email = `demo-${randomUUID().slice(0, 8)}@prospect.test`;
    const since = new Date(Date.now() - 1000);

    await page.goto("/fr/demo");
    await page.getByLabel("Adresse e-mail professionnelle").fill(email);
    await page.getByLabel("Nom du cabinet").fill("Cabinet du Prospect");
    await page.getByText("Plus de 3", { exact: true }).click();
    await page.getByRole("button", { name: "Ouvrir la démo" }).click();

    await expect(page).toHaveURL(/\/fr\/demo\/espace$/);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Bienvenue, Cabinet du Prospect",
      }),
    ).toBeVisible();
    await expect(page.getByText(/Démo en lecture seule/)).toBeVisible();
    await expectAccessible(page);
    // Lecture seule : aucun formulaire, aucune action, rien qui mène à l'espace cabinet.
    await expect(page.locator("main form")).toHaveCount(0);
    await expect(page.locator('main a[href^="/app"]')).toHaveCount(0);

    await page
      .getByRole("link", { name: /Caramel/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/fr\/demo\/espace\?suivi=/);
    await expect(
      page.getByRole("heading", { name: "Conversation avec Numa" }),
    ).toBeVisible();
    await expect(page.getByText(/je suis Numa, l'assistante IA/)).toBeVisible();
    await expectAccessible(page);

    // Premier e-mail de la séquence, avec un lien d'accès qui ouvre la démo ailleurs.
    const mail = await latestEmail(email, since);
    expect(mail.Subject).toBe("Votre démo Stivea Vet est prête");
    const access = /(http\S+\/demo\/acces\/[\w-]{43})/.exec(mail.Text)?.[1];
    const unsubscribe = /(http\S+\/fr\/desinscription\?jeton=[\w-]{43})/.exec(
      mail.Text,
    )?.[1];
    expect(access).toBeDefined();
    expect(unsubscribe).toBeDefined();

    const elsewhere = await freshPage(browser);
    await elsewhere.goto(access ?? "");
    await expect(elsewhere).toHaveURL(/\/fr\/demo\/espace$/);
    await expect(
      elsewhere.getByRole("heading", {
        name: "Bienvenue, Cabinet du Prospect",
      }),
    ).toBeVisible();

    // Afficher la page de désinscription ne désinscrit pas : il faut confirmer.
    await elsewhere.goto(unsubscribe ?? "");
    await elsewhere.getByRole("button", { name: "Me désinscrire" }).click();
    await expect(
      elsewhere.getByText(
        "C'est fait : vous ne recevrez plus nos e-mails de présentation.",
      ),
    ).toBeVisible();
  });

  test("un lien de désinscription inconnu est refusé", async ({ page }) => {
    await page.goto(`/fr/desinscription?jeton=${"A".repeat(43)}`);
    await page.getByRole("button", { name: "Me désinscrire" }).click();
    await expect(
      page.getByText(/Ce lien de désinscription n'est pas valable/),
    ).toBeVisible();
  });

  test("désinscription en un clic par la messagerie : POST seulement", async ({
    request,
  }) => {
    const get = await request.get(
      `/api/desinscription?jeton=${"A".repeat(43)}`,
    );
    expect(get.status()).toBe(405);
    const post = await request.post(
      `/api/desinscription?jeton=${"A".repeat(43)}`,
    );
    expect(post.status()).toBe(204);
  });
});
