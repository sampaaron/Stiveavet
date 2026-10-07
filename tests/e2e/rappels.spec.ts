import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { expectAccessible } from "./support/flows";
import { expectLastBubble, launchFollowup, phone } from "./support/suivis";

/**
 * Rappels et fin du suivi (lot 15) : après l'accord, le programme se remplit ; chaque clic du
 * simulateur avance jusqu'au prochain envoi, jusqu'à la fin à la date de contrôle. Le
 * propriétaire réécrit ensuite : Numa répond et la vétérinaire est prévenue.
 * Un animal par projet (un animal n'a qu'un suivi ouvert) : pas de nouvelle tentative.
 */
const CASES: Record<
  string,
  {
    animal: string;
    owner: string;
    intro: string;
    thanks: string;
    closing: string;
    after: string;
    ack: string;
  }
> = {
  desktop: {
    animal: "Pistache",
    owner: "Lucie",
    intro: "je suis Numa, l'assistante IA",
    thanks: "Merci Lucie",
    closing: "se termine aujourd'hui",
    after: "Bonjour, elle a très bien récupéré",
    ack: "Merci pour ces nouvelles de Pistache",
  },
  "mobile-320": {
    animal: "Mistral",
    owner: "Grace",
    intro: "I'm Numa, the AI (artificial intelligence) assistant",
    thanks: "Thank you Grace",
    closing: "ends today",
    after: "Hello, she has recovered well",
    ack: "Thank you for the news about Mistral",
  },
};

test.describe.configure({ retries: 0 });

const advance = (page: Page) =>
  page.getByRole("button", { name: "Avancer jusqu'au prochain envoi prévu" });

test("rappels programmés, fin à la date de contrôle, puis le propriétaire réécrit", async ({
  page,
}, testInfo) => {
  test.setTimeout(150_000);
  const story = CASES[testInfo.project.name];
  test.skip(!story, "Projet sans animal réservé");
  if (!story) return;

  // 1. Lancement, premier message et accord.
  const dossier = await launchFollowup(page, story.animal, "5");
  const programme = page.getByRole("list", { name: "Étapes du suivi" });
  await expect(programme).toContainText("Après l'accord du propriétaire");
  await page.goto(`${dossier}/simulateur`);
  await advance(page).click();
  await expect(page).toHaveURL(/\?fait=avance$/);
  await expectLastBubble(page, story.intro);
  await page.getByRole("button", { name: "OUI", exact: true }).click();
  await expect(page).toHaveURL(/\?fait=envoye$/);
  await expectLastBubble(page, story.thanks);

  // 2. Le programme est planifié dans la plage d'envoi du cabinet.
  await page.goto(dossier);
  await expect(programme).toContainText("Prévu le");
  await expect(
    page.getByText(/Fin du suivi automatisé le .*date du contrôle/),
  ).toBeVisible();
  await expectAccessible(page);

  // 3. Chaque clic avance jusqu'au prochain envoi, jusqu'au message de clôture.
  await page.goto(`${dossier}/simulateur`);
  await expect(async () => {
    await advance(page).click();
    await expect(page).toHaveURL(/\?fait=avance$/);
    await expect(phone(page)).toContainText(story.closing, { timeout: 1_000 });
  }).toPass({ timeout: 60_000 });

  // 4. Dossier : rappels envoyés, suivi terminé, conversation ouverte.
  await page.goto(dossier);
  await expect(programme).toContainText("Envoyé le");
  await expect(programme).not.toContainText("Prévu le");
  await expect(page.locator("#conversation")).toContainText(
    "Suivi automatisé terminé à la date de contrôle",
  );
  await expect(page.getByText(/^Suivi automatisé terminé le /)).toBeVisible();
  await expectAccessible(page);

  // 5. Le propriétaire réécrit : Numa répond, la vétérinaire est prévenue.
  await page.goto(`${dossier}/simulateur`);
  await page.getByLabel(`Message de ${story.owner}`).fill(story.after);
  await page
    .getByRole("button", { name: "Envoyer en tant que propriétaire" })
    .click();
  await expect(page).toHaveURL(/\?fait=envoye$/);
  await expectLastBubble(page, story.ack);
  await page.goto("/app/alertes");
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: `${story.animal} · À surveiller` }),
  ).toContainText(
    "Le propriétaire a réécrit après la fin du suivi automatisé.",
  );

  // 6. Journal : la fin automatique est tracée.
  await page.goto("/app/journal");
  await expect(
    page
      .getByText(
        "Fin du suivi automatisé à la date de contrôle (la conversation reste ouverte)",
      )
      .first(),
  ).toBeVisible();
});
