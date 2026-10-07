import { expect, test as setup } from "@playwright/test";

import { CLAIRE, PHRASE } from "./support/accounts";
import { securityCode } from "./support/mailpit";

setup("connexion de Claire avec code de sécurité", async ({ page }) => {
  const since = new Date(Date.now() - 1000);
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(CLAIRE);
  await page.getByLabel("Mot de passe").fill(PHRASE);
  await page.getByRole("button", { name: "Se connecter" }).click();

  await expect(page).toHaveURL(/\/connexion\/code$/);
  await page
    .getByLabel("Code de sécurité")
    .fill(await securityCode(CLAIRE, since));
  await page.getByRole("button", { name: "Valider le code" }).click();

  await expect(page).toHaveURL(/\/app$/);
  await page.context().storageState({ path: "tests/e2e/.auth/claire.json" });
});
