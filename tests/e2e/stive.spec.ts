import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { expectAccessible } from "./support/flows";
import { expectLastBubble, launchFollowup, phone } from "./support/suivis";

/**
 * Stive (lot 29, ADR 0034) : depuis le dossier, un résumé ; un rendez-vous demandé à Numa
 * confirmé sur la carte de Stive ; un brouillon posé dans la zone de saisie, qui ne part
 * qu'au clic sur Envoyer ; le journal et le point du jour.
 * Claire est connectée dans les deux projets, avec une seule conversation Stive : chaque
 * vérification cible l'animal du projet, jamais « la dernière réponse ».
 * Un animal par projet (un animal n'a qu'un suivi ouvert) : pas de nouvelle tentative.
 */
const CASES: Record<string, { animal: string; owner: string }> = {
  desktop: { animal: "Tofu", owner: "Élodie" },
  "mobile-320": { animal: "Grisou", owner: "Julien" },
};

test.describe.configure({ retries: 0 });

const thread = (page: Page) =>
  page.getByRole("list", { name: "Échanges avec Stive" });

/** Clic sur une suggestion : Stive répond, la page revient sur sa dernière réponse. */
async function suggest(page: Page, question: string) {
  await page
    .getByRole("list", { name: "Suggestions" })
    .getByRole("button", { name: question, exact: true })
    .click();
  await expect(page).toHaveURL(/#derniere-reponse$/);
}

async function say(page: Page, owner: string, text: string) {
  await page.getByLabel(`Message de ${owner}`).fill(text);
  await page
    .getByRole("button", { name: "Envoyer en tant que propriétaire" })
    .click();
  await expect(page).toHaveURL(/fait=envoye$/);
}

test("résumé, rendez-vous confirmé et brouillon envoyé seulement au clic", async ({
  page,
}, testInfo) => {
  test.setTimeout(150_000);
  const story = CASES[testInfo.project.name];
  test.skip(!story, "Projet sans animal réservé");
  if (!story) return;
  const { animal, owner } = story;

  // 1. Depuis le dossier, « Demander à Stive » : la page s'ouvre sur ce dossier.
  const dossier = await launchFollowup(page, animal, "3");
  await page.getByRole("link", { name: "Demander à Stive" }).click();
  await expect(page).toHaveURL(/\/app\/stive\?suivi=[0-9a-f-]+$/);
  await expect(
    page.getByText(`Dossier de ${animal}`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Stive est une IA. Il ne pose aucun diagnostic"),
  ).toBeVisible();
  await expectAccessible(page);

  await suggest(page, `Résumé du dossier de ${animal}`);
  await expect(
    thread(page).getByRole("heading", {
      name: `Résumé du dossier de ${animal}`,
    }),
  ).not.toHaveCount(0);
  await expectAccessible(page);

  // 2. Le propriétaire accepte puis choisit un créneau avec Numa.
  await page.goto(`${dossier}/simulateur`);
  await page
    .getByRole("button", { name: "Avancer jusqu'au prochain envoi prévu" })
    .click();
  await expect(page).toHaveURL(/\?fait=avance$/);
  await expectLastBubble(page, "je suis Numa, l'assistante IA");
  await page.getByRole("button", { name: "OUI", exact: true }).click();
  await expect(page).toHaveURL(/\?fait=envoye$/);
  await expect(async () => {
    await page.reload();
    await expect(phone(page)).toContainText(`Merci ${owner}`, {
      timeout: 1_000,
    });
  }).toPass({ timeout: 15_000 });
  await say(
    page,
    owner,
    "Bonjour, est-ce qu'on peut prendre rendez-vous pour le contrôle ?",
  );
  await expectLastBubble(page, "Voici les prochains créneaux disponibles");
  await say(page, owner, "1");
  await expectLastBubble(page, "C'est noté : je demande à l'équipe");

  // 3. Stive le présente « À confirmer » ; rien ne change avant le clic.
  await page.goto("/app/stive");
  await suggest(page, "Rendez-vous à confirmer");
  const confirm = thread(page)
    .getByRole("button", {
      name: new RegExp(`^Confirmer le rendez-vous de ${animal}, `),
    })
    .last();
  await expect(confirm).toBeVisible();
  await page.goto("/app/agenda");
  await expect(
    page
      .getByRole("list", { name: "Rendez-vous à confirmer" })
      .getByRole("listitem")
      .filter({ hasText: animal }),
  ).toBeVisible();
  await page.goBack();
  await expect(confirm).toBeVisible();
  await expectAccessible(page);
  await confirm.click();
  await expect(
    thread(page)
      .getByRole("listitem")
      .filter({ hasText: animal })
      .filter({ hasText: "Rendez-vous confirmé" })
      .first(),
  ).toBeVisible();
  await page.goto(dossier);
  await expect(
    page.getByRole("heading", { name: "Rendez-vous" }),
  ).toBeVisible();
  await expect(page.getByText("Confirmé", { exact: true })).toBeVisible();

  // 4. Un brouillon : posé dans la zone de saisie du dossier, il ne part qu'au clic.
  await page.getByRole("link", { name: "Demander à Stive" }).click();
  await suggest(
    page,
    `Brouillon de message pour prendre des nouvelles de ${animal}`,
  );
  const draft = thread(page)
    .getByRole("listitem")
    .filter({
      has: page.getByRole("heading", {
        name: new RegExp(`^Brouillon pour .*\\(${animal}\\)$`),
      }),
    })
    .last();
  await expect(draft).toContainText(`Je prends des nouvelles de ${animal}`);
  await draft
    .getByRole("link", { name: "Ouvrir dans la conversation" })
    .click();
  await expect(page).toHaveURL(/\?brouillon=[0-9a-f-]+#conversation$/);
  const composer = page.getByLabel(`Écrire à ${owner}`);
  await expect(composer).toHaveValue(
    new RegExp(`Je prends des nouvelles de ${animal}`),
  );
  await expect(
    page.getByText("Brouillon préparé par Stive : relisez-le"),
  ).toBeVisible();
  await expectAccessible(page);

  await page.goto(`${dossier}/simulateur`);
  await expect(phone(page)).not.toContainText(
    `Je prends des nouvelles de ${animal}`,
  );
  await page.goBack();
  await expect(composer).toHaveValue(
    new RegExp(`Je prends des nouvelles de ${animal}`),
  );
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(page).toHaveURL(/\?fait=reprise-en-main#conversation$/);
  await page.goto(`${dossier}/simulateur`);
  await page
    .getByRole("button", { name: "Avancer jusqu'au prochain envoi prévu" })
    .click();
  // L'annonce du rendez-vous confirmé part dans le même envoi : l'ordre peut varier.
  await expect(async () => {
    await page.reload();
    await expect(
      phone(page)
        .getByRole("listitem")
        .filter({ hasText: "Dr Claire Fontaine" })
        .filter({ hasText: `Je prends des nouvelles de ${animal}` }),
    ).toHaveCount(1, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });

  // 5. Le journal garde l'action préparée par Stive ; le tableau de bord, le point du jour.
  await page.goto("/app/journal");
  await expect(
    page.getByText("a confirmé une action préparée par Stive").first(),
  ).toBeVisible();
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { level: 2, name: /^Le point de Stive/ }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Ouvrir Stive" })).toBeVisible();
});

test("le point du jour de Stive, en un clic", async ({ page }) => {
  await page.goto("/app/stive");
  await suggest(page, "Mon point du jour");
  await expect(
    thread(page).getByRole("heading", { name: "Votre point du jour" }).last(),
  ).toBeVisible();
  await expect(
    thread(page).getByText("Aujourd'hui à l'agenda").last(),
  ).toBeVisible();
  await expect(
    page.getByText(/Ce mois-ci : \d+ demandes? sur 600\./),
  ).toBeVisible();
  await expectAccessible(page);

  // Une question hors de ses six demandes : une réponse honnête, jamais inventée.
  await page
    .getByLabel("Votre demande à Stive")
    .fill("Quelle dose d'anti-inflammatoire pour un chat ?");
  await page.getByRole("button", { name: "Demander", exact: true }).click();
  await expect(page).toHaveURL(/#derniere-reponse$/);
  await expect(
    thread(page).getByText("Je ne sais pas encore faire ça.").last(),
  ).toBeVisible();
  // Et il dit pourquoi : la conversation libre demande l'IA branchée.
  await expect(
    thread(page)
      .getByText(/la conversation libre sur le métier demande l'IA branchée/)
      .last(),
  ).toBeVisible();
});

/** Conversation en mode simulé (ADR 0042) : Stive échange simplement, sans rien inventer. */
async function ask(page: Page, question: string) {
  await page.getByLabel("Votre demande à Stive").fill(question);
  await page.getByRole("button", { name: "Demander", exact: true }).click();
  await expect(page).toHaveURL(/#derniere-reponse$/);
}

test("conversation simple en mode simulé, honnête sur l'IA à brancher", async ({
  page,
}) => {
  await page.goto("/app/stive");
  await expect(
    page.getByRole("note").filter({ hasText: "Mode simulé" }),
  ).toContainText("AI_PROVIDER");
  await expect(
    page.getByText("Discuter librement du métier : demande l'IA branchée"),
  ).toBeVisible();

  await ask(page, "Bonjour Stive !");
  await expect(
    thread(page)
      .getByText("Bonjour ! Je suis Stive, l'assistant IA de l'équipe.", {
        exact: false,
      })
      .last(),
  ).toBeVisible();

  await ask(page, "Qui es-tu ?");
  await expect(
    thread(page)
      .getByText(/Je suis Stive, une IA, l'assistant de l'équipe du cabinet/)
      .last(),
  ).toBeVisible();

  await ask(
    page,
    "Comment annoncer une complication à un propriétaire inquiet ?",
  );
  await expect(
    thread(page)
      .getByRole("listitem")
      .filter({ hasText: "la conversation libre sur le métier demande l'IA" })
      .last(),
  ).toBeVisible();
  // Chaque échange reste présenté comme venant d'une IA.
  await expect(thread(page).getByText("Assistant IA").last()).toBeVisible();
  await expectAccessible(page);
});
