import { test as base } from "@playwright/test";
import type { BrowserContext } from "@playwright/test";

import { encodeConsent } from "../../../src/domains/consentement/cookies";

export { expect } from "@playwright/test";
export type { Browser, BrowserContext, Page } from "@playwright/test";

/**
 * Les parcours se jouent comme une personne qui a déjà répondu au bandeau de cookies
 * (ADR 0053) : « Tout refuser », posé dans chaque contexte de navigateur, y compris ceux
 * qu'un test ouvre lui-même. Le bandeau a ses propres tests (cookies.spec.ts).
 */
export async function withConsent(context: BrowserContext, baseURL: string) {
  await context.addCookies([
    {
      name: "sv_consent",
      value: encodeConsent({
        audience: false,
        marketing: false,
        givenAt: new Date(),
      }),
      url: baseURL,
    },
  ]);
}

export const test = base.extend<{ consentEverywhere: void }>({
  context: async ({ context, baseURL }, provide) => {
    if (baseURL) await withConsent(context, baseURL);
    await provide(context);
  },
  // Contextes ouverts par le test lui-même (autre personne, autre langue).
  consentEverywhere: [
    async ({ browser, baseURL }, provide) => {
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async (options) => {
        const context = await newContext(options);
        if (baseURL) await withConsent(context, baseURL);
        return context;
      };
      await provide();
      browser.newContext = newContext;
    },
    { auto: true },
  ],
});
