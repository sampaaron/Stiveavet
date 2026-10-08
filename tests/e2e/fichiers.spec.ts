import { expect, test } from "@playwright/test";

import { fictionalPng } from "../support/png";
import { expectAccessible } from "./support/flows";
import { expectLastBubble, launchFollowup } from "./support/suivis";

/**
 * Photos, vocaux et captures d'agenda (lot 16) : le propriétaire envoie une photo et un vocal
 * depuis le simulateur ; la vétérinaire les voit dans le dossier par des liens signés de
 * deux minutes, qui ne s'ouvrent pas sans sa session. Puis une capture d'agenda est lue et
 * supprimée. Un animal et un agenda par projet : pas de nouvelle tentative.
 */
const CASES: Record<
  string,
  {
    animal: string;
    owner: string;
    intro: string;
    thanks: string;
    photoAck: string;
    spoken: string;
    duration: string;
    voiceAck: string;
    vet: string;
  }
> = {
  desktop: {
    animal: "Moka",
    owner: "Camille",
    intro: "je suis Numa, l'assistante IA",
    thanks: "Merci Camille",
    photoAck: "la photo de Moka est bien arrivée",
    spoken: "Elle se repose tranquillement à la maison",
    duration: "0:03",
    voiceAck: "Merci pour ces nouvelles de Moka",
    vet: "Dr Claire Fontaine",
  },
  "mobile-320": {
    animal: "Maple",
    owner: "Harry",
    intro: "I'm Numa, the AI (artificial intelligence) assistant",
    thanks: "Thank you Harry",
    photoAck: "the photo of Maple has arrived",
    spoken: "She is resting quietly at home",
    duration: "0:02",
    voiceAck: "Thank you for the news about Maple",
    vet: "Dr Hugo Marchal",
  },
};

test.describe.configure({ retries: 0 });

test("photo et vocal du propriétaire, lisibles par liens signés seulement", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(120_000);
  const story = CASES[testInfo.project.name];
  test.skip(!story, "Projet sans animal réservé");
  if (!story) return;

  // 1. Suivi lancé, premier message et accord.
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

  // 2. Photo du propriétaire : accusé de réception de Numa.
  await page.getByLabel(`Photo envoyée par ${story.owner}`).setInputFiles({
    name: "cicatrice.png",
    mimeType: "image/png",
    buffer: fictionalPng(),
  });
  await page.getByRole("button", { name: "Envoyer la photo" }).click();
  await expect(page).toHaveURL(/\?fait=photo$/);
  await expectLastBubble(page, story.photoAck);

  // 3. Message vocal : transcrit (simulé), Numa répond à son contenu.
  await page
    .getByLabel(`Ce que dit le message vocal de ${story.owner}`)
    .fill(story.spoken);
  await page.getByRole("button", { name: "Envoyer le vocal" }).click();
  await expect(page).toHaveURL(/\?fait=vocal$/);
  await expectLastBubble(page, story.voiceAck);

  // 4. Dossier : la photo s'affiche, le vocal s'écoute, la transcription se lit.
  await page.goto(dossier);
  const conversation = page.locator("#conversation");
  const image = conversation.getByRole("img", {
    name: `Photo envoyée par ${story.owner}`,
  });
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
    .toBe(64);
  await expect(conversation.locator("audio")).toHaveCount(1);
  await expect(conversation).toContainText(`« ${story.spoken} »`);
  await expect(conversation).toContainText(`Message vocal · ${story.duration}`);
  await expectAccessible(page);

  // 5. Le lien ne s'ouvre qu'avec la session de la vétérinaire, et intact.
  const src = await image.getAttribute("src");
  expect(src).toMatch(/^\/app\/fichiers\/[0-9a-f-]+\?e=\d+&s=[\w-]+$/);
  const own = await page.request.get(src ?? "");
  expect(own.status()).toBe(200);
  expect(own.headers()["content-type"]).toBe("image/png");
  expect(own.headers()["cache-control"]).toContain("no-store");
  const tampered = await page.request.get(
    (src ?? "").replace(/s=([\w-])/, (_, first: string) =>
      first === "A" ? "s=B" : "s=A",
    ),
  );
  expect(tampered.status()).toBe(404);
  // Navigateur sans session (Playwright reprend sinon la session de Claire).
  const stranger = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const anonymous = await stranger.request.get(src ?? "", {
    maxRedirects: 0,
  });
  expect(anonymous.status()).toBe(404);
  await stranger.close();
});

test("capture d'agenda : créneaux libres lus, capture supprimée", async ({
  page,
}, testInfo) => {
  const story = CASES[testInfo.project.name];
  test.skip(!story, "Projet sans agenda réservé");
  if (!story) return;

  await page.goto("/app/agenda");
  await expect(
    page.getByRole("heading", { level: 1, name: "Agenda" }),
  ).toBeVisible();
  await expect(
    page.getByText("ne laissez visibles que les créneaux libres"),
  ).toBeVisible();
  await page.getByLabel("Agenda de").selectOption({ label: story.vet });
  await page.getByLabel("Capture d'écran de l'agenda").setInputFiles({
    name: "agenda.png",
    mimeType: "image/png",
    buffer: fictionalPng(200, 120, [240, 240, 240]),
  });
  await page.getByRole("button", { name: "Lire les créneaux libres" }).click();
  await expect(page).toHaveURL(/\?fait=capture&creneaux=8$/);
  await expect(
    page.getByRole("status").filter({ hasText: "Capture lue" }),
  ).toHaveText(
    "Capture lue : 8 créneaux libres enregistrés. Le fichier a été supprimé.",
  );
  await expect(
    page
      .getByRole("list", { name: "Dernières captures" })
      .getByRole("listitem")
      .first(),
  ).toContainText("supprimée le");
  const slots = page
    .getByRole("listitem")
    .filter({ hasText: story.vet })
    .filter({ hasText: "09:30" });
  await expect(slots.first()).toBeVisible();
  await expectAccessible(page);

  // Un créneau pris entre-temps se retire.
  const before = await page
    .getByRole("listitem")
    .filter({ hasText: story.vet })
    .count();
  await slots
    .first()
    .getByRole("button", { name: /^Retirer le créneau/ })
    .click();
  await expect(page).toHaveURL(/\?fait=retire$/);
  await expect(
    page.getByRole("listitem").filter({ hasText: story.vet }),
  ).toHaveCount(before - 1);
});
