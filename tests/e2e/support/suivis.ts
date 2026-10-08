import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/** Accord du ou des propriétaires pour WhatsApp, recueilli au cabinet (lot 21). */
export const OPT_IN = /accepté au cabinet d'être contactés? sur WhatsApp/;

/** Prépare puis lance le suivi d'un animal de dr.veto simulé ; renvoie l'adresse du dossier. */
export async function launchFollowup(
  page: Page,
  animal: string,
  hours: string,
  /** Prénom et nom du second propriétaire à inclure (lot 18). */
  secondOwner?: string,
) {
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
  if (secondOwner)
    await page
      .getByRole("checkbox", {
        name: new RegExp(`^Inclure ${secondOwner}, second propriétaire`),
      })
      .check();
  await page.getByRole("checkbox", { name: OPT_IN }).check();
  await page.getByRole("button", { name: "Lancer le suivi" }).click();
  await expect(page).toHaveURL(/\/app\/suivis\/[0-9a-f-]+\?fait=lance$/);
  return page.url().replace(/\?.*$/, "");
}

/** Bulles du téléphone simulé, dans l'ordre. */
export const phone = (page: Page) =>
  page.getByRole("list", { name: "Messages reçus et envoyés" });

/**
 * Dernière bulle du téléphone. Un autre test peut exécuter la tâche d'envoi en même temps
 * (worker partagé) : la réponse arrive alors un instant plus tard, on recharge la page.
 */
export async function expectLastBubble(page: Page, text: string) {
  await expect(async () => {
    await page.reload();
    await expect(phone(page).getByRole("listitem").last()).toContainText(text, {
      timeout: 1_000,
    });
  }).toPass({ timeout: 15_000 });
}
