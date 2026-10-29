import { expect, test } from "./support/test";

import { expectAccessible, signUp } from "./support/flows";
import { OPT_IN, expectLastBubble, phone } from "./support/suivis";

/**
 * Parcours complet du MVP, sur un cabinet créé pour l'occasion : inscription, propriétaire et
 * animal, protocole, lancement, conversation WhatsApp simulée, alerte traitée puis close,
 * historique ; et aucun accès aux données d'un autre cabinet (les Tilleuls de Claire).
 */
const CARAMEL = "/app/suivis/3f6b2a9e-1c4d-4e8a-9b51-7a0c2d5e8f11";

test.describe("parcours complet d'un nouveau cabinet", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("de l'inscription à l'alerte close, sans voir un autre cabinet", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "Un cabinet complet par exécution : un seul format d'écran.",
    );
    test.setTimeout(150_000);

    // 1. Création du cabinet (offre Pro) et connexion.
    await signUp(page, "Pro");

    // 2. Démarrage guidé : WhatsApp simulé, réglages de départ, un protocole validé.
    await page.getByLabel("Numéro WhatsApp Business").fill("06 12 34 56 78");
    await page
      .getByRole("button", { name: "Connecter le numéro (simulé)" })
      .click();
    await expect(page.getByText("•• •• •• •• 78 (simulé)")).toBeVisible();
    // dr.veto n'est pas compris dans Pro : le registre des animaux suffit.
    await expect(
      page.getByText(/^Compris dans la formule Premium/),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Appliquer les réglages de départ" })
      .click();
    await expect(
      page.getByText("À compléter : un contact d'urgence."),
    ).toBeVisible();
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

    // 3. Propriétaire et animal.
    await page.goto("/app/animaux/nouveau");
    await page.getByLabel("Nom", { exact: true }).fill("Figue");
    await page.getByLabel("Espèce").selectOption("cat");
    await page.getByLabel("Nom et prénom").fill("Inès Fictive");
    await page.getByLabel("Numéro WhatsApp").fill("06 70 00 00 31");
    await page.getByRole("button", { name: "Enregistrer l'animal" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Figue" }),
    ).toBeVisible();

    // 4. Protocole proposé selon l'intervention, suivi lancé depuis la fiche.
    await page
      .getByLabel("Intervention", { exact: true })
      .fill("Stérilisation de la chatte");
    await page
      .getByRole("button", { name: "Préparer la fiche de lancement" })
      .click();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Fiche de lancement de Figue",
      }),
    ).toBeVisible();
    await page.getByRole("checkbox", { name: OPT_IN }).check();
    await page.getByRole("button", { name: "Lancer le suivi" }).click();
    await expect(page).toHaveURL(/\/app\/suivis\/[0-9a-f-]+\?fait=lance$/);
    const dossier = page.url().replace(/\?.*$/, "");

    // 5. Message WhatsApp simulé : présentation de Numa (une IA), accord, réponse.
    await page.goto(`${dossier}/simulateur`);
    await page
      .getByRole("button", { name: "Avancer jusqu'au prochain envoi prévu" })
      .click();
    await expectLastBubble(page, "je suis Numa, l'assistante IA");
    await page.getByRole("button", { name: "OUI", exact: true }).click();
    await expectLastBubble(page, "Merci Inès");

    // 6. Le propriétaire signale un signe grave : consignes et alerte.
    await page.getByLabel("Message de Inès").fill("Elle respire mal");
    await page
      .getByRole("button", { name: "Envoyer en tant que propriétaire" })
      .click();
    await expect(async () => {
      await page.reload();
      await expect(phone(page)).toContainText("Consignes du cabinet :", {
        timeout: 1_000,
      });
    }).toPass({ timeout: 15_000 });

    // 7. Traitement : accusé de réception dans le dossier, puis clôture.
    await page.goto(dossier);
    const alertCard = page
      .getByRole("alert")
      .filter({ hasText: "Urgence signalée" });
    await alertCard.getByRole("button", { name: "Accuser réception" }).click();
    await expect(page).toHaveURL(/\?fait=alerte-recue$/);
    await page.goto("/app/alertes");
    await page
      .getByRole("listitem")
      .filter({ hasText: "Figue · Urgence signalée" })
      .getByRole("button", { name: "Clore l'alerte" })
      .click();
    await expect(page).toHaveURL(/\/app\/alertes\?fait=close$/);

    // 8. Historique : l'alerte close, le suivi sur la fiche, le journal.
    await page.getByRole("link", { name: "Historique" }).click();
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: "Figue · Urgence signalée" }),
    ).toContainText("Close par Dr Alix Essai");
    await expectAccessible(page);
    await page.goto("/app/animaux");
    await page.getByRole("link", { name: "Ouvrir la fiche de Figue" }).click();
    await expect(
      page.getByRole("heading", { name: "Historique des suivis" }),
    ).toBeVisible();
    await expect(
      page.getByText("Stérilisation de la chatte").first(),
    ).toBeVisible();
    await page.goto("/app/journal");
    for (const sentence of [
      "a enregistré un animal dans le registre",
      "a accusé réception d'une alerte",
      "a clos une alerte",
    ])
      await expect(page.getByText(sentence).first()).toBeVisible();

    // 9. Isolation : rien des Tilleuls n'est visible ni accessible.
    for (const path of [CARAMEL, `${CARAMEL}/simulateur`])
      expect((await page.goto(path))?.status()).toBe(404);
    await page.goto("/app/animaux?statut=all");
    await expect(page.getByText("Caramel")).toHaveCount(0);
    await page.goto("/app/suivis");
    await expect(page.getByText("Caramel")).toHaveCount(0);
    await page.goto("/app/alertes?vue=historique");
    await expect(page.getByText(/Caramel|Moka/)).toHaveCount(0);
  });
});
