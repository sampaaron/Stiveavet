import { expect, test } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";

import { en } from "../../src/i18n/app/en";
import { fr } from "../../src/i18n/app/fr";

import {
  expectAccessible,
  loginWithCode,
  openAccountMenu,
  signUp,
} from "./support/flows";

/**
 * Lot 19 (ADR 0022) : chaque écran de l'espace cabinet et de connexion en anglais, contrôlé
 * par axe. La langue est choisie par le cookie de préférence, jamais dans le compte de Claire
 * (les autres parcours la lisent en français) ; la bascule et le retour de la langue du
 * compte à la connexion se vérifient avec un cabinet créé pour l'occasion.
 */

/** Textes français des dictionnaires qui ont une traduction : aucun ne doit rester à l'écran. */
function frenchOnly(french: unknown, english: unknown, found: string[] = []) {
  if (typeof french === "string") {
    if (french !== english && french.length >= 12) found.push(french);
  } else if (french && typeof french === "object")
    for (const [key, value] of Object.entries(french))
      frenchOnly(value, (english as Record<string, unknown>)[key], found);
  return found;
}
/**
 * Coïncidences avec les données, qui restent en français (ADR 0022) : nom d'un protocole de
 * la bibliothèque, message de Numa et trace « Accord donné par… » du dossier fictif de
 * Caramel, libellé du mandat simulé, nom du cabinet créé par `signUp`.
 */
const DATA = new Set([
  "Suivi de traitement",
  "les consignes d'urgence",
  "Accord donné",
  "Mandat de prélèvement",
  "Cabinet vétérinaire",
]);
const FRENCH = frenchOnly(fr, en).filter((text) => !DATA.has(text));

async function chooseEnglish(context: BrowserContext, baseURL: string) {
  await context.addCookies([{ name: "sv_lang", value: "en", url: baseURL }]);
}

async function expectEnglish(page: Page, heading: string | RegExp) {
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { level: 1, name: heading }),
  ).toBeVisible();
  const text = await page.locator("body").innerText();
  expect(FRENCH.filter((french) => text.includes(french))).toEqual([]);
  await expectAccessible(page);
}

const caramel = "/app/suivis/3f6b2a9e-1c4d-4e8a-9b51-7a0c2d5e8f11";
const SCREENS: [path: string, heading: string | RegExp][] = [
  ["/app", "Hello Claire"],
  ["/app/suivis", "Follow-ups"],
  ["/app/suivis/nouveau", "Start a follow-up"],
  [caramel, "Caramel"],
  [`${caramel}/simulateur`, "Owner simulator"],
  ["/app/alertes", "Alerts"],
  ["/app/agenda", "Calendar"],
  ["/app/protocoles", "Protocols"],
  ["/app/protocoles/nouveau", "New protocol"],
  ["/app/reglages", "Numa, emergencies and on-call"],
  ["/app/equipe", "Team and permissions"],
  ["/app/facturation", "Billing"],
  ["/app/journal", "Activity log"],
  ["/app/taches", "Failed tasks"],
  ["/app/demarrage", "Guided setup"],
];

/** Une fiche de lancement par projet : un animal n'a qu'un suivi ouvert. */
const DRAFT_ANIMAL: Record<string, string> = {
  desktop: "Hazel",
  "mobile-320": "Juniper",
};

test.describe("espace cabinet en anglais", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await chooseEnglish(context, baseURL ?? "");
  });

  for (const [path, heading] of SCREENS)
    test(`${path} en anglais`, async ({ page }) => {
      await page.goto(path);
      await expectEnglish(page, heading);
    });

  test("un protocole et la fiche de lancement en anglais", async ({
    page,
  }, testInfo) => {
    await page.goto("/app/protocoles");
    await page
      .getByRole("link", { name: /^Stérilisation de la chatte/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/app\/protocoles\/[0-9a-f-]+$/);
    await expectEnglish(page, /Stérilisation de la chatte/);

    const animal = DRAFT_ANIMAL[testInfo.project.name];
    test.skip(!animal, "Projet sans animal réservé");
    if (!animal) return;
    await page.goto("/app/suivis/nouveau");
    await page.getByLabel("Animal, owner or dr.veto ID").fill(animal);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page
      .getByRole("button", { name: `Prepare the sheet for ${animal}` })
      .click();
    await expect(page).toHaveURL(/\/app\/suivis\/[0-9a-f-]+\/lancement/);
    await expectEnglish(page, `Launch sheet for ${animal}`);
  });
});

test.describe("connexion en anglais", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("pages de connexion et bascule sans compte", async ({
    page,
    context,
    baseURL,
  }) => {
    // Navigateur en français : la page suit Accept-Language, puis la bascule.
    await page.goto("/connexion");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await page
      .getByRole("button", { name: "Langue de l'interface : English" })
      .click();
    await expect(page).toHaveURL(/\/connexion$/);
    await expectEnglish(page, "Sign in to your practice");

    for (const [path, heading] of [
      ["/inscription", "Create your practice"],
      ["/mot-de-passe-oublie", "Forgotten password"],
      ["/mot-de-passe/nouveau?jeton=inconnu", "Choose a new password"],
      ["/invitation?jeton=inconnu", "Join a practice"],
    ] as const) {
      await page.goto(path);
      await expectEnglish(page, heading);
    }
    await expect(
      page.getByText("This invitation is no longer valid."),
    ).toBeVisible();

    // Retour au français, mémorisé par le cookie.
    await page.goto("/connexion");
    await page
      .getByRole("button", { name: "Interface language: Français" })
      .click();
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Connexion à votre cabinet",
      }),
    ).toBeVisible();
    expect(
      (await context.cookies(baseURL)).find((c) => c.name === "sv_lang")?.value,
    ).toBe("fr");
  });

  test("la langue choisie dans l'espace cabinet suit le compte", async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    const { email, password } = await signUp(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await openAccountMenu(page);
    await page
      .getByRole("button", { name: "Langue de l'interface : English" })
      .click();
    await expect(page).toHaveURL(/\/app\/demarrage$/);
    await expectEnglish(page, "Guided setup");

    // Nouvel appareil, sans cookie de langue : le code est demandé en français, puis
    // l'espace cabinet revient dans la langue enregistrée dans le compte.
    await context.clearCookies();
    await loginWithCode(page, email, password);
    await expectEnglish(page, /^Hello/);

    // Écran du code de sécurité en anglais.
    await context.clearCookies();
    await chooseEnglish(context, new URL(page.url()).origin);
    await page.goto("/connexion");
    await page.getByLabel("E-mail address").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/connexion\/code$/);
    await expectEnglish(page, "Let's check it's really you");
  });
});
