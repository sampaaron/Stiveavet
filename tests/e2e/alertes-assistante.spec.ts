import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { expectAccessible, login, signUp } from "./support/flows";
import { latestEmail } from "./support/mailpit";
import { OPT_IN, expectLastBubble } from "./support/suivis";

/**
 * Alertes « à surveiller » d'abord confiées à l'assistante (ADR 0049), sur un cabinet créé
 * pour l'occasion : l'administrateur donne le droit, l'alerte quitte « À traiter » du
 * vétérinaire, l'assistante la prend en charge puis la transmet, et elle revient.
 */
test.describe("alertes « à surveiller » et assistante", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("l'assistante autorisée prend l'alerte, puis la transmet au vétérinaire", async ({
    page,
    browser,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "Un cabinet complet par exécution : un seul format d'écran.",
    );
    test.setTimeout(180_000);

    // 1. Cabinet, WhatsApp simulé, protocole validé, animal et suivi lancé.
    await signUp(page, "Pro");
    await page.getByLabel("Numéro WhatsApp Business").fill("06 12 34 56 79");
    await page
      .getByRole("button", { name: "Connecter le numéro (simulé)" })
      .click();
    await expect(page.getByText("•• •• •• •• 79 (simulé)")).toBeVisible();
    await page.goto("/app/protocoles");
    await page
      .getByRole("button", {
        name: "Ajouter « Stérilisation de la chatte » au cabinet",
      })
      .click();
    await page
      .getByRole("link", { name: /Stérilisation de la chatte/ })
      .first()
      .click();
    await page.getByRole("button", { name: "Valider ce protocole" }).click();
    await expect(page.getByText("Validée par Dr Alix Essai")).toBeVisible();
    await page.goto("/app/animaux/nouveau");
    await page.getByLabel("Nom", { exact: true }).fill("Noisette");
    await page.getByLabel("Espèce").selectOption("cat");
    await page.getByLabel("Nom et prénom").fill("Jeanne Fictive");
    await page.getByLabel("Numéro WhatsApp").fill("06 70 00 00 32");
    await page.getByRole("button", { name: "Enregistrer l'animal" }).click();
    await page
      .getByLabel("Intervention", { exact: true })
      .fill("Stérilisation de la chatte");
    await page
      .getByRole("button", { name: "Préparer la fiche de lancement" })
      .click();
    await page.getByRole("checkbox", { name: OPT_IN }).check();
    await page.getByRole("button", { name: "Lancer le suivi" }).click();
    await expect(page).toHaveURL(/\/app\/suivis\/[0-9a-f-]+\?fait=lance$/);
    const dossier = page.url().replace(/\?.*$/, "");

    // 2. Le propriétaire accepte, puis signale un signe à surveiller.
    await page.goto(`${dossier}/simulateur`);
    await page
      .getByRole("button", { name: "Avancer jusqu'au prochain envoi prévu" })
      .click();
    await expectLastBubble(page, "je suis Numa, l'assistante IA");
    await page.getByRole("button", { name: "OUI", exact: true }).click();
    await expectLastBubble(page, "Merci Jeanne");
    await page
      .getByLabel("Message de Jeanne")
      .fill("Elle a un peu vomi ce matin");
    await page
      .getByRole("button", { name: "Envoyer en tant que propriétaire" })
      .click();
    // L'alerte naît du tri du message, en tâche de fond : la page est rechargée jusqu'à elle.
    await page.goto("/app");
    const inbox = page.getByRole("list", { name: "À traiter" });
    await expect(async () => {
      await page.reload();
      await expect(
        inbox.getByRole("listitem").filter({ hasText: "Noisette" }),
      ).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });

    // 3. Une assistante rejoint le cabinet ; l'administrateur lui donne le droit.
    const email = `asv-${randomUUID().slice(0, 8)}@essai.test`;
    const since = new Date(Date.now() - 1000);
    await page.goto("/app/equipe");
    await page.getByLabel("Nom", { exact: true }).fill("Sam Essai");
    await page.getByLabel("Adresse e-mail").fill(email);
    await page
      .getByLabel("Rôle", { exact: true })
      .selectOption({ label: "Assistant vétérinaire" });
    await page.getByRole("button", { name: "Envoyer l'invitation" }).click();
    await expect(page.getByText("Invitation envoyée.")).toBeVisible();
    const { Text } = await latestEmail(email, since);
    const link = /\/invitation\?jeton=[\w-]+/.exec(Text)?.[0] ?? "";
    const assistant = await (
      await browser.newContext({ storageState: { cookies: [], origins: [] } })
    ).newPage();
    await assistant.goto(link);
    const password = "une phrase de passe assistante";
    await assistant.getByLabel("Mot de passe", { exact: true }).fill(password);
    await assistant.getByLabel("Confirmer le mot de passe").fill(password);
    await assistant.getByRole("button", { name: "Créer mon compte" }).click();
    await expect(assistant).toHaveURL(/\/connexion\?raison=invitation$/);

    await page.reload();
    const rights = page.getByRole("group", { name: "Droits de Sam Essai" });
    for (const label of [
      /^Lire conversations, photos/,
      /^Prendre en charge les alertes « à surveiller »/,
    ])
      await rights.getByRole("checkbox", { name: label }).check();
    await rights
      .locator("xpath=ancestor::form")
      .getByRole("button", { name: "Enregistrer les droits" })
      .click();
    await expect(page.getByText("Droits enregistrés.")).toBeVisible();

    // 4. Côté vétérinaire, l'alerte quitte « À traiter » ; l'équipe l'a en main.
    await page.goto("/app");
    await expect(
      page.getByText(
        "1 alerte « à surveiller » est prise en charge par l'équipe.",
        { exact: false },
      ),
    ).toBeVisible();
    await expect(
      inbox.getByRole("listitem").filter({ hasText: "Noisette" }),
    ).toHaveCount(0);

    // 5. L'assistante la voit, la prend en charge, puis la transmet.
    await login(assistant, email, password);
    await expect(assistant).toHaveURL(/\/app$/);
    const row = assistant
      .getByRole("list", { name: "À traiter" })
      .getByRole("listitem")
      .filter({ hasText: "Noisette" });
    await row.getByRole("button", { name: "Je m'en occupe" }).click();
    await expect(assistant).toHaveURL(/\/app\?fait=alerte-recue#a-traiter$/);
    await expect(row).toContainText("Prise en charge par Sam Essai");
    await expectAccessible(assistant);
    await row
      .getByRole("button", { name: "Transmettre au vétérinaire" })
      .click();
    await expect(assistant).toHaveURL(
      /\/app\?fait=alerte-transmise#a-traiter$/,
    );
    await expect(
      row.getByRole("button", { name: "Transmettre au vétérinaire" }),
    ).toHaveCount(0);

    // 6. Elle revient dans « À traiter » du vétérinaire, avec qui l'a transmise.
    await page.goto("/app");
    const back = inbox.getByRole("listitem").filter({ hasText: "Noisette" });
    await expect(back).toContainText("Transmise à Dr Alix Essai par Sam Essai");
    await back.getByRole("button", { name: "Accuser réception" }).click();
    await expect(page).toHaveURL(/\/app\?fait=alerte-recue#a-traiter$/);
    await page.goto("/app/journal");
    await expect(
      page.getByText(
        "Sam Essai a transmis une alerte « à surveiller » au vétérinaire",
      ),
    ).toBeVisible();
  });
});
