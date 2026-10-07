import { describe, expect, it } from "vitest";

import { LOCALES } from "./locales";
import { SITE_PAGES, localeOfPath, pageFor, pathFor } from "./routes";
import type { SitePage } from "./routes";

describe("adresses du site", () => {
  it("construit l'adresse d'une page dans chaque langue", () => {
    expect(pathFor("home", "fr")).toBe("/fr");
    expect(pathFor("pricing", "fr")).toBe("/fr/tarifs");
    expect(pathFor("pricing", "en")).toBe("/en/pricing");
    expect(pathFor("demoSpace", "en")).toBe("/en/demo/workspace");
  });

  it("retrouve chaque page depuis son adresse, et rien d'autre", () => {
    for (const locale of LOCALES)
      for (const page of Object.keys(SITE_PAGES) as SitePage[]) {
        const segments = pathFor(page, locale).split("/").slice(2);
        expect(pageFor(locale, segments)).toBe(page);
      }
    expect(pageFor("fr", ["pricing"])).toBeNull();
    expect(pageFor("en", ["tarifs"])).toBeNull();
    expect(pageFor("fr", ["inconnue"])).toBeNull();
  });

  it("deux pages n'ont jamais la même adresse", () => {
    for (const locale of LOCALES) {
      const slugs = Object.values(SITE_PAGES).map((slugs) => slugs[locale]);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });

  it("déduit la langue de l'adresse", () => {
    expect(localeOfPath("/en")).toBe("en");
    expect(localeOfPath("/en/pricing")).toBe("en");
    expect(localeOfPath("/fr/tarifs")).toBe("fr");
    expect(localeOfPath("/app")).toBe("fr");
    expect(localeOfPath("/english")).toBe("fr");
  });
});
