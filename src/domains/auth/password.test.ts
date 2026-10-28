import { describe, expect, it } from "vitest";

import { isCommonPassword, passwordRoot } from "./common-passwords";
import { COMMON_PASSWORDS } from "./mots-de-passe-courants";
import { hashPassword, passwordProblems, verifyPassword } from "./password";

describe("politique de mot de passe", () => {
  it.each([
    ["trop court", "court-1"],
    ["courant, même décoré", "Azerty2024!"],
    ["courant", "motdepasse123456"],
    ["répétitif", "aaaaaaaaaaaaaaaa"],
  ])("refuse un mot de passe %s", (_label, password) => {
    expect(passwordProblems(password)).not.toHaveLength(0);
  });

  it("refuse un mot de passe contenant le nom ou l'e-mail", () => {
    expect(
      passwordProblems("cabinet-fontaine-2026", {
        email: "claire.fontaine@tilleuls.test",
        displayName: "Dr Claire Fontaine",
      }),
    ).toContainEqual({ code: "personal" });
  });

  it("renvoie des codes stables avec leurs valeurs", () => {
    // « aaaa » est aussi une répétition, donc un mot de passe courant.
    expect(passwordProblems("aaaa")).toEqual([
      { code: "too_short", min: 12 },
      { code: "repetitive" },
      { code: "common" },
    ]);
    expect(passwordProblems(`${"une phrase ".repeat(12)}trop longue`)).toEqual([
      { code: "too_long", max: 128 },
    ]);
  });

  it("accepte une phrase de passe", () => {
    expect(passwordProblems("le chat dort sur la radio")).toEqual([]);
  });

  it.each([
    "P@ssw0rd2024!!",
    "mot de passe 2026",
    "Sunshine-1987!!",
    "Marseille13013!",
    "Doudou123456!",
    "Veterinaire2026",
    "123456789012",
    "qwertyuiopasdf",
    "soleilsoleil",
    "azertyazerty!",
    "Iloveyou123456",
    "JeTaimeMilou!!",
  ])("refuse le mot de passe courant « %s »", (password) => {
    expect(passwordProblems(password)).toContainEqual({ code: "common" });
  });

  it.each([
    "tilleuls fictifs en local",
    "une phrase de passe solide 42",
    "un nouveau mot de passe tout neuf",
    "Tr0ub4dor&3-cheval-agrafe",
    "8#2$9!1@7%3^5&",
  ])("accepte « %s »", (password) => {
    expect(passwordProblems(password)).toEqual([]);
  });
});

describe("liste des mots de passe courants", () => {
  it("embarque plus de 10 000 racines, normalisées et uniques", () => {
    const roots = COMMON_PASSWORDS.split("\n").filter(Boolean);
    expect(roots.length).toBeGreaterThan(10_000);
    expect(new Set(roots).size).toBe(roots.length);
    for (const root of roots) expect(passwordRoot(root), root).toBe(root);
  });

  it("compare des formes normalisées", () => {
    expect(passwordRoot(" Mot-de_Passe 2024! ")).toBe("motdepasse");
    expect(passwordRoot("P@$$w0rd")).toBe("password");
    expect(passwordRoot("Élève!")).toBe("eleve");
    expect(passwordRoot("2024!!")).toBe("");
    expect(isCommonPassword("2024!!")).toBe(false);
  });
});

describe("hachage Argon2id", () => {
  it("vérifie le bon mot de passe et refuse les autres", async () => {
    const hash = await hashPassword("le chat dort sur la radio");
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(hash, "le chat dort sur la radio")).toBe(true);
    expect(await verifyPassword(hash, "le chien dort sur la radio")).toBe(
      false,
    );
    expect(await verifyPassword(null, "le chat dort sur la radio")).toBe(false);
    expect(await verifyPassword("pas une empreinte", "x")).toBe(false);
  });
});
