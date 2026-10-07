import { expect, test } from "@playwright/test";

import { expectAccessible } from "./support/flows";
import { expectLastBubble, launchFollowup, phone } from "./support/suivis";

/**
 * Triage et alertes (lot 14) : le propriétaire signale une urgence dans le simulateur, reçoit
 * aussitôt les consignes du cabinet ; la vétérinaire voit l'alerte, accuse réception, puis la
 * clôt. Un animal par projet (un animal n'a qu'un suivi ouvert) : pas de nouvelle tentative.
 */
const CASES: Record<
  string,
  {
    animal: string;
    owner: string;
    intro: string;
    thanks: string;
    urgent: string;
    instructions: string;
  }
> = {
  desktop: {
    animal: "Nougat",
    owner: "Inès",
    intro: "je suis Numa, l'assistante IA",
    thanks: "Merci Inès",
    urgent: "Elle respire mal depuis une heure",
    instructions: "Consignes du cabinet :",
  },
  "mobile-320": {
    animal: "Olive",
    owner: "Oliver",
    intro: "I'm Numa, the AI (artificial intelligence) assistant",
    thanks: "Thank you Oliver",
    urgent: "She is struggling to breathe",
    instructions: "Clinic instructions:",
  },
};

test.describe.configure({ retries: 0 });

test("urgence : consignes immédiates, alerte, accusé de réception puis clôture", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const story = CASES[testInfo.project.name];
  test.skip(!story, "Projet sans animal réservé");
  if (!story) return;

  // 1. Suivi lancé, premier message et accord du propriétaire.
  const dossier = await launchFollowup(page, story.animal, "5");
  await page.goto(`${dossier}/simulateur`);
  await page
    .getByRole("button", { name: "Avancer jusqu'au prochain envoi prévu" })
    .click();
  await expect(page).toHaveURL(/\?fait=avance$/);
  await expectLastBubble(page, story.intro);
  await page.getByRole("button", { name: "OUI", exact: true }).click();
  await expect(page).toHaveURL(/\?fait=envoye$/);
  await expectLastBubble(page, story.thanks);

  // 2. Le propriétaire signale une urgence : les consignes partent tout de suite.
  await page.getByLabel(`Message de ${story.owner}`).fill(story.urgent);
  await page
    .getByRole("button", { name: "Envoyer en tant que propriétaire" })
    .click();
  await expect(page).toHaveURL(/\?fait=envoye$/);
  await expect(async () => {
    await page.reload();
    await expect(phone(page)).toContainText(story.instructions, {
      timeout: 1_000,
    });
  }).toPass({ timeout: 15_000 });

  // 3. Dans le dossier : l'urgence, en attente d'accusé de réception, et le rappel global.
  await page.goto(dossier);
  const alertCard = page
    .getByRole("alert")
    .filter({ hasText: "Urgence signalée" });
  await expect(alertCard).toContainText("sans accusé de réception");
  await expect(alertCard).toContainText(
    "Sans accusé de réception, toute l'équipe vétérinaire sera alertée à",
  );
  await expect(
    page.getByRole("alert").filter({ hasText: /urgences? .*sans accusé/ }),
  ).toBeVisible();
  await expect(page.locator("#conversation")).toContainText(story.urgent);
  await expectAccessible(page);

  // 4. Accusé de réception : l'escalade est annulée.
  await alertCard.getByRole("button", { name: "Accuser réception" }).click();
  await expect(page).toHaveURL(/\?fait=alerte-recue$/);
  await expect(
    page.getByRole("status").filter({ hasText: "Réception confirmée" }).first(),
  ).toBeVisible();
  const received = page
    .getByRole("status")
    .filter({ hasText: "Urgence signalée" });
  await expect(received).toContainText(
    "Réception confirmée par Dr Claire Fontaine",
  );
  await expectAccessible(page);

  // 5. Liste des alertes : la vétérinaire clôt l'alerte de cet animal.
  await page.goto("/app/alertes");
  await expect(
    page.getByRole("heading", { level: 1, name: "Alertes" }),
  ).toBeVisible();
  const item = page
    .getByRole("listitem")
    .filter({ hasText: `${story.animal} · Urgence signalée` });
  await expect(item).toContainText("Réception confirmée");
  await expectAccessible(page);
  await item.getByRole("button", { name: "Clore l'alerte" }).click();
  await expect(page).toHaveURL(/\/app\/alertes\?fait=close$/);
  await expect(
    page.getByRole("listitem").filter({ hasText: `${story.animal} ·` }),
  ).toHaveCount(0);

  // 6. Journal : chaque décision est tracée, sans le texte du propriétaire.
  await page.goto("/app/journal");
  for (const sentence of [
    "Triage : un message de propriétaire a ouvert une alerte",
    "a accusé réception d'une alerte",
    "a clos une alerte",
  ])
    await expect(page.getByText(sentence).first()).toBeVisible();
  await expect(page.getByText(story.urgent)).toHaveCount(0);
});
