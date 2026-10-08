import { describe, expect, it } from "vitest";

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
    expect(passwordProblems("aaaa")).toEqual([
      { code: "too_short", min: 12 },
      { code: "repetitive" },
    ]);
    expect(passwordProblems(`${"une phrase ".repeat(12)}trop longue`)).toEqual([
      { code: "too_long", max: 128 },
    ]);
  });

  it("accepte une phrase de passe", () => {
    expect(passwordProblems("le chat dort sur la radio")).toEqual([]);
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
