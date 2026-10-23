import { describe, expect, it } from "vitest";

import { PLAIN_NAME, passwordChangeInput, signupInput } from "./validators";

const signup = (organizationName: string) =>
  signupInput.safeParse({
    organizationName,
    displayName: "Dr Claire Fontaine",
    email: "claire@exemple.test",
    plan: "premium",
    password: "le chat dort sur la radio",
    confirmation: "le chat dort sur la radio",
    acceptTerms: "on",
    authorized: "on",
  });

describe("noms repris dans les e-mails", () => {
  it.each([
    "Clinique vétérinaire des Tilleuls",
    "Cabinet Saint-Martin & associés",
    "Clinique Vét. du Parc (Lyon 3e)",
  ])("accepte « %s »", (name) => {
    expect(PLAIN_NAME.test(name)).toBe(true);
    expect(signup(name).success).toBe(true);
  });

  it.each([
    "Cabinet https://exemple.test",
    "Voir www.exemple.test",
    "Écrire à contact@exemple.test",
    "Cabinet\nOuvrir : exemple.test",
    "Cabinet​caché",
    "<b>Cabinet</b>",
  ])("refuse « %s » à l'inscription", (name) => {
    expect(PLAIN_NAME.test(name)).toBe(false);
    expect(signup(name).error?.issues[0]?.message).toBe(
      "organization_name_chars",
    );
  });
});

describe("changement de mot de passe", () => {
  it("exige l'ancien mot de passe et deux saisies identiques", () => {
    expect(
      passwordChangeInput.safeParse({
        current: "",
        password: "une nouvelle phrase",
        confirmation: "une nouvelle phrase",
      }).error?.issues[0]?.message,
    ).toBe("password_required");
    expect(
      passwordChangeInput.safeParse({
        current: "ancienne phrase",
        password: "une nouvelle phrase",
        confirmation: "une autre phrase",
      }).error?.issues[0]?.message,
    ).toBe("passwords_mismatch");
  });
});
