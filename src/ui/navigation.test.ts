import { describe, expect, it } from "vitest";

import {
  appNavigation,
  isNavItemActive,
  visibleNavigation,
} from "./navigation";

describe("isNavItemActive", () => {
  it("n'active « Aujourd'hui » que sur la racine de l'espace cabinet", () => {
    expect(isNavItemActive("/app", "/app")).toBe(true);
    expect(isNavItemActive("/app", "/app/suivis")).toBe(false);
  });

  it("active une entrée sur ses sous-pages, pas sur un préfixe voisin", () => {
    expect(isNavItemActive("/app/suivis", "/app/suivis/123")).toBe(true);
    expect(isNavItemActive("/app/suivis", "/app/suivis-archives")).toBe(false);
  });
});

describe("appNavigation", () => {
  it("n'a pas deux entrées vers la même page", () => {
    const hrefs = appNavigation.flatMap((section) =>
      section.items.map((item) => item.href),
    );

    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("visibleNavigation", () => {
  it("ne cite que des permissions du catalogue", async () => {
    const { PERMISSION_KEYS } = await import("@/domains/equipe/permissions");
    for (const item of appNavigation.flatMap((section) => section.items))
      for (const key of item.anyOf ?? [])
        expect(PERMISSION_KEYS).toContain(key);
  });

  it("n'affiche à un assistant ni l'équipe, ni le journal, ni la facturation", async () => {
    const { ROLE_PERMISSIONS } = await import("@/domains/equipe/permissions");
    const hrefs = visibleNavigation(
      new Set(ROLE_PERMISSIONS.assistant.defaults),
    ).flatMap((section) => section.items.map((item) => item.href));
    expect(hrefs).toContain("/app/suivis");
    for (const hidden of ["/app/equipe", "/app/journal", "/app/facturation"])
      expect(hrefs).not.toContain(hidden);
  });
});
