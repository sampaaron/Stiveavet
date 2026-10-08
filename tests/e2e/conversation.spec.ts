import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { expectAccessible } from "./support/flows";

/**
 * Numa simulée et conversation (lot 13) : lancement, accord du propriétaire dans le
 * simulateur, échange, reprise en main par la vétérinaire, puis « Reprendre Numa ».
 * Un animal par projet (un animal n'a qu'un suivi ouvert) : pas de nouvelle tentative.
 */
const CASES: Record<
  string,
  {
    animal: string;
    owner: string;
    firstContactHours: string;
    intro: string;
    thanks: string;
    ack: string;
  }
> = {
  desktop: {
    animal: "Plume",
    owner: "Margaux",
    firstContactHours: "4",
    intro: "je suis Numa, l'assistante IA",
    thanks: "Merci Margaux",
    ack: "Merci pour ces nouvelles de Plume",
  },
  "mobile-320": {
    animal: "Tango",
    owner: "Emily",
    firstContactHours: "6",
    intro: "I'm Numa, the AI (artificial intelligence) assistant",
    thanks: "Thank you Emily",
    ack: "Thank you for the news about Tango",
  },
};

test.describe.configure({ retries: 0 });

async function launchFollowup(page: Page, animal: string, hours: string) {
  await page.goto("/app/suivis/nouveau");
  await page
    .getByLabel("Animal, propriétaire ou identifiant dr.veto")
    .fill(animal);
  await page.getByRole("button", { name: "Rechercher" }).click();
  await page
    .getByRole("button", { name: `Préparer la fiche de ${animal}` })
    .click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: `Fiche de lancement de ${animal}`,
    }),
  ).toBeVisible();
  // Aucun protocole proposé pour l'intervention importée : la vétérinaire en choisit un.
  const choose = page.getByRole("button", { name: "Appliquer ce protocole" });
  if (await choose.isVisible()) {
    await page
      .getByLabel("Protocole", { exact: true })
      .selectOption({ label: "Stérilisation de la chatte (version 1)" });
    await choose.click();
    await expect(page).toHaveURL(/\?fait=protocole$/);
  }
  await page.getByLabel("Heures après l'intervention").fill(hours);
  await page.getByRole("button", { name: "Lancer le suivi" }).click();
  await expect(page).toHaveURL(/\/app\/suivis\/[0-9a-f-]+\?fait=lance$/);
  return page.url().replace(/\?.*$/, "");
}

/** Bulles du téléphone simulé, dans l'ordre. */
const phone = (page: Page) =>
  page.getByRole("list", { name: "Messages reçus et envoyés" });

/**
 * Dernière bulle du téléphone. Un autre test peut exécuter la tâche d'envoi en même temps
 * (worker partagé) : la réponse arrive alors un instant plus tard, on recharge la page.
 */
async function expectLastBubble(page: Page, text: string) {
  await expect(async () => {
    await page.reload();
    await expect(phone(page).getByRole("listitem").last()).toContainText(text, {
      timeout: 1_000,
    });
  }).toPass({ timeout: 15_000 });
}

test("accord, échange, reprise en main puis « Reprendre Numa »", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const story = CASES[testInfo.project.name];
  test.skip(!story, "Projet sans animal réservé");
  if (!story) return;

  // 1. Lancement : rien ne part avant l'heure choisie.
  const dossier = await launchFollowup(
    page,
    story.animal,
    story.firstContactHours,
  );
  const conversation = page.locator("#conversation");
  await expect(conversation).toContainText(
    "Numa n'a pas encore écrit : son premier message part à l'heure prévue.",
  );
  await expect(conversation).toContainText(
    "Vous pourrez écrire au propriétaire une fois son accord donné.",
  );

  // 2. Simulateur (local) : on avance jusqu'au premier message, présenté comme une IA.
  await page
    .getByRole("link", { name: "ouvrir le simulateur du propriétaire" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Simulateur du propriétaire" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Avancer jusqu'aux envois prévus" })
    .click();
  await expect(page).toHaveURL(/\?fait=avance$/);
  await expectLastBubble(page, story.intro);
  await expect(phone(page)).toContainText("Dr Claire Fontaine");
  await expectAccessible(page);

  // 3. Accord du propriétaire, puis un premier échange avec Numa.
  await page.getByRole("button", { name: "OUI", exact: true }).click();
  await expect(page).toHaveURL(/\?fait=envoye$/);
  await expectLastBubble(page, story.thanks);
  await page
    .getByLabel(`Message de ${story.owner}`)
    .fill("Elle mange bien ce soir");
  await page
    .getByRole("button", { name: "Envoyer en tant que propriétaire" })
    .click();
  await expect(phone(page)).toContainText("Elle mange bien ce soir");
  await expectLastBubble(page, story.ack);

  // 4. La vétérinaire écrit : Numa se met en pause.
  await page.goto(dossier);
  await expect(conversation).toContainText("Numa suit la conversation.");
  await expect(conversation).toContainText("Elle mange bien ce soir");
  await page
    .getByLabel(`Écrire à ${story.owner}`)
    .fill("Bonjour, ici Dr Fontaine. Je passe prendre des nouvelles.");
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(page).toHaveURL(/\?fait=reprise-en-main#conversation$/);
  await expect(page.getByRole("status").first()).toContainText(
    "vous avez repris la main",
  );
  await expect(conversation).toContainText(
    "Vous avez repris la main : Numa est en pause.",
  );
  await expect(conversation).toContainText("Dr Claire Fontaine · via WhatsApp");
  await expectAccessible(page);

  // 5. Le propriétaire reçoit le message de la vétérinaire ; Numa ne répond plus.
  await page.goto(`${dossier}/simulateur`);
  await page
    .getByRole("button", { name: "Avancer jusqu'aux envois prévus" })
    .click();
  await expect(page).toHaveURL(/\?fait=avance$/);
  await expectLastBubble(page, "Bonjour, ici Dr Fontaine.");
  await page.getByLabel(`Message de ${story.owner}`).fill("Merci docteur");
  await page
    .getByRole("button", { name: "Envoyer en tant que propriétaire" })
    .click();
  await expect(page).toHaveURL(/\?fait=envoye$/);
  await expect(phone(page).getByRole("listitem").last()).toContainText(
    "Merci docteur",
  );

  // 6. « Reprendre Numa » : elle répond de nouveau au message suivant.
  await page.goto(dossier);
  await page.getByRole("button", { name: "Reprendre Numa" }).click();
  await expect(page).toHaveURL(/\?fait=numa#conversation$/);
  await expect(conversation).toContainText("Numa suit la conversation.");
  await page.goto(`${dossier}/simulateur`);
  await page.getByLabel(`Message de ${story.owner}`).fill("Elle dort bien");
  await page
    .getByRole("button", { name: "Envoyer en tant que propriétaire" })
    .click();
  await expect(page).toHaveURL(/\?fait=envoye$/);
  await expectLastBubble(page, story.ack);

  // 7. Chaque décision humaine est au journal, sans le texte des messages.
  await page.goto("/app/journal");
  for (const sentence of [
    "a écrit à un propriétaire",
    "a repris la main sur une conversation (Numa en pause)",
    "a rendu la conversation à Numa",
  ])
    await expect(page.getByText(sentence).first()).toBeVisible();
  await expect(page.getByText("Je passe prendre des nouvelles")).toHaveCount(0);
});
