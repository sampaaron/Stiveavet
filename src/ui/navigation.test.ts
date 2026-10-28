import { describe, expect, it } from "vitest";

import {
  appNavigation,
  currentSection,
  footerNavigation,
  isNavItemActive,
  visibleFooter,
  visibleNavigation,
} from "./navigation";

const allItems = [
  ...appNavigation.flatMap((section) => section.tabs),
  ...footerNavigation,
];

describe("isNavItemActive", () => {
  it("n'active « Vue d'ensemble » que sur la racine de l'espace cabinet", () => {
    expect(isNavItemActive("/app", "/app")).toBe(true);
    expect(isNavItemActive("/app", "/app/suivis")).toBe(false);
  });

  it("active un onglet sur ses sous-pages, pas sur un préfixe voisin", () => {
    expect(isNavItemActive("/app/suivis", "/app/suivis/123")).toBe(true);
    expect(isNavItemActive("/app/suivis", "/app/suivis-archives")).toBe(false);
  });
});

describe("appNavigation", () => {
  it("n'a pas deux entrées vers la même page", () => {
    const hrefs = allItems.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("tient en quatre rubriques : Accueil, Suivi, Protocoles, Cabinet", () => {
    expect(appNavigation.map((section) => section.label)).toEqual([
      "home",
      "followupSection",
      "protocols",
      "practice",
    ]);
  });

  it("place Stive juste après la vue d'ensemble, dans l'accueil", () => {
    const [home] = appNavigation;
    expect(home?.tabs.slice(0, 2).map((tab) => tab.href)).toEqual([
      "/app",
      "/app/stive",
    ]);
  });
});

describe("visibleNavigation", () => {
  it("ne cite que des permissions du catalogue", async () => {
    const { PERMISSION_KEYS } = await import("@/domains/equipe/permissions");
    for (const item of allItems)
      for (const key of item.anyOf ?? [])
        expect(PERMISSION_KEYS).toContain(key);
  });

  it("n'affiche à un assistant ni l'équipe, ni le journal, ni la facturation", async () => {
    const { ROLE_PERMISSIONS } = await import("@/domains/equipe/permissions");
    const granted = new Set(ROLE_PERMISSIONS.assistant.defaults);
    const hrefs = visibleNavigation(granted).flatMap((section) =>
      section.tabs.map((tab) => tab.href),
    );
    expect(hrefs).toContain("/app/suivis");
    for (const hidden of ["/app/equipe", "/app/journal", "/app/facturation"])
      expect(hrefs).not.toContain(hidden);
    expect(visibleFooter(granted).map((item) => item.href)).toEqual([
      "/app/aide",
    ]);
  });

  it("range les documents du cabinet sous Protocoles, avec les mêmes droits", () => {
    const protocols = appNavigation.find(
      (section) => section.label === "protocols",
    );
    const [first, documents] = protocols?.tabs ?? [];
    expect(documents?.href).toBe("/app/documents");
    expect(documents?.anyOf).toEqual(first?.anyOf);
  });

  it("retire « Protocoles » sans l'accès aux protocoles, même avec Stive", () => {
    const labels = visibleNavigation(new Set(["stive.use"])).map(
      (section) => section.label,
    );
    expect(labels).not.toContain("protocols");
  });

  it("retire une rubrique dont aucun onglet n'est permis", () => {
    const labels = visibleNavigation(new Set()).map((section) => section.label);
    expect(labels).toEqual(["home"]);
  });
});

describe("currentSection", () => {
  const sections = visibleNavigation(
    new Set(["followups.read_all", "organization.settings", "stive.use"]),
  );

  it("retrouve la rubrique d'une page et de ses sous-pages", () => {
    expect(currentSection(sections, "/app")?.label).toBe("home");
    expect(currentSection(sections, "/app/suivis/abc")?.label).toBe(
      "followupSection",
    );
    expect(currentSection(sections, "/app/integrations")?.label).toBe(
      "practice",
    );
  });

  it("n'en trouve aucune pour le compte", () => {
    expect(currentSection(sections, "/app/compte")).toBeUndefined();
  });
});
