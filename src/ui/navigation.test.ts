import { describe, expect, it } from "vitest";

import { appNavigation, isNavItemActive } from "./navigation";

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
