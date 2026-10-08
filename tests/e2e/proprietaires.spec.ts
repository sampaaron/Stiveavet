import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { expectAccessible } from "./support/flows";
import { expectLastBubble, launchFollowup } from "./support/suivis";

/**
 * Deux propriétaires et rendez-vous (lot 18) : chacun donne son accord, le groupe naît du
 * second accord ; un propriétaire demande un rendez-vous, Numa propose les créneaux libres
 * de la vétérinaire responsable, le cabinet confirme. Enfin, STOP dans le groupe puis GROUPE.
 * Un animal par projet (un animal n'a qu'un suivi ouvert) : pas de nouvelle tentative.
 */
const CASES: Record<
  string,
  {
    animal: string;
    first: string;
    second: string;
    secondFull: string;
    introFirst: string;
    introSecond: string;
    waiting: string;
    welcome: string;
    ask: string;
    offer: string;
    chosen: string;
    confirmed: string;
    clarify: string;
    left: string;
  }
> = {
  desktop: {
    animal: "Filou",
    first: "Nathalie",
    second: "Marc",
    secondFull: "Marc Lefèvre",
    introFirst: "proposé aussi à Marc",
    introSecond: "proposé aussi à Nathalie",
    waiting: "Dès que Marc aura accepté",
    welcome: "Bonjour Nathalie et Marc",
    ask: "Bonjour, est-ce qu'on peut prendre rendez-vous pour le contrôle ?",
    offer: "Voici les prochains créneaux disponibles avec Dr Claire Fontaine",
    chosen: "C'est noté : je demande à l'équipe",
    confirmed: "Le rendez-vous de Filou est confirmé",
    clarify: "Répondez GROUPE pour quitter le groupe",
    left: "vous avez quitté le groupe",
  },
  "mobile-320": {
    animal: "Pepper",
    first: "Sarah",
    second: "Tom",
    secondFull: "Tom Wilson",
    introFirst: "also offered to Tom",
    introSecond: "also offered to Sarah",
    waiting: "As soon as Tom accepts too",
    welcome: "Hello Sarah and Tom",
    ask: "Hello, can we book an appointment for the check-up?",
    offer: "Here are the next available slots with Dr Claire Fontaine",
    chosen: "Noted: I'm asking the",
    confirmed: "The appointment for Pepper is confirmed",
    clarify: "Reply GROUP to leave the group",
    left: "you have left the group",
  },
};

test.describe.configure({ retries: 0 });

const advance = (page: Page) =>
  page.getByRole("button", { name: "Avancer jusqu'au prochain envoi prévu" });

async function say(page: Page, owner: string, text: string) {
  await page.getByLabel(`Message de ${owner}`).fill(text);
  await page
    .getByRole("button", { name: "Envoyer en tant que propriétaire" })
    .click();
  await expect(page).toHaveURL(/fait=envoye$/);
}

test("deux propriétaires, un groupe, un rendez-vous confirmé par le cabinet", async ({
  page,
}, testInfo) => {
  test.setTimeout(150_000);
  const story = CASES[testInfo.project.name];
  test.skip(!story, "Projet sans animal réservé");
  if (!story) return;

  // 1. Lancement avec le second propriétaire.
  const dossier = await launchFollowup(
    page,
    story.animal,
    "5",
    story.secondFull,
  );
  await expect(
    page.getByText("Un groupe WhatsApp sera créé quand les deux contacts"),
  ).toBeVisible();

  // 2. Chacun reçoit sa demande d'accord ; le premier OUI attend le second.
  await page.goto(`${dossier}/simulateur`);
  await advance(page).click();
  await expect(page).toHaveURL(/\?fait=avance$/);
  await expectLastBubble(page, story.introFirst);
  await page.getByRole("button", { name: "OUI", exact: true }).click();
  await expect(page).toHaveURL(/\?fait=envoye$/);
  await expectLastBubble(page, story.waiting);

  await page.getByRole("link", { name: `Jouer ${story.second}` }).click();
  await expect(page).toHaveURL(/\?contact=secondary$/);
  await expectLastBubble(page, story.introSecond);
  await expectAccessible(page);
  await page.getByRole("button", { name: "OUI", exact: true }).click();
  await expect(page).toHaveURL(/\?contact=secondary&fait=envoye$/);
  await expectLastBubble(page, story.welcome);

  // 3. Dans le groupe, une demande de rendez-vous : créneaux de la responsable, puis choix.
  await say(page, story.second, story.ask);
  await expectLastBubble(page, story.offer);
  await say(page, story.second, "1");
  await expectLastBubble(page, story.chosen);

  // 4. Le cabinet confirme depuis l'agenda.
  await page.goto("/app/agenda");
  const pending = page
    .getByRole("list", { name: "Rendez-vous à confirmer" })
    .getByRole("listitem")
    .filter({ hasText: story.animal });
  await expect(pending).toBeVisible();
  await expectAccessible(page);
  await pending
    .getByRole("button", {
      name: new RegExp(`^Confirmer le rendez-vous de ${story.animal}`),
    })
    .click();
  await expect(page).toHaveURL(/\?fait=confirme$/);
  await expect(
    page.getByRole("status").filter({ hasText: "Rendez-vous confirmé" }),
  ).toBeVisible();

  // Numa l'annonce dans le groupe ; le dossier l'affiche.
  await page.goto(`${dossier}/simulateur?contact=secondary`);
  await advance(page).click();
  await expectLastBubble(page, story.confirmed);
  await page.goto(dossier);
  await expect(
    page.getByRole("heading", { name: "Rendez-vous" }),
  ).toBeVisible();
  await expect(page.getByText("Confirmé", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel(`Écrire à ${story.first} et ${story.second}`),
  ).toBeVisible();

  // 5. STOP dans le groupe : Numa demande en privé ; GROUPE, le second propriétaire sort.
  await page.goto(`${dossier}/simulateur?contact=secondary`);
  await page.getByRole("button", { name: "STOP", exact: true }).click();
  await expect(page).toHaveURL(/fait=envoye$/);
  await expectLastBubble(page, story.clarify);
  await page.getByRole("button", { name: "GROUPE", exact: true }).click();
  await expect(page).toHaveURL(/fait=envoye$/);
  await expectLastBubble(page, story.left);
  await page.goto(dossier);
  await expect(
    page.getByText(`${story.second} : a quitté le groupe`),
  ).toBeVisible();
  await expect(page.getByLabel(`Écrire à ${story.first}`)).toBeVisible();

  // 6. Le journal garde chaque étape, sans contenu.
  await page.goto("/app/journal");
  for (const sentence of [
    "groupe WhatsApp créé avec Numa",
    "a demandé un rendez-vous à Numa",
    "a confirmé un rendez-vous choisi avec Numa",
    "Un propriétaire a quitté le groupe",
  ])
    await expect(page.getByText(sentence).first()).toBeVisible();
});
