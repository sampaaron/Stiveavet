import { describe, expect, it } from "vitest";

import { demoRequestInput } from "./validators";

const request = (cabinetName: string) =>
  demoRequestInput.safeParse({
    email: "prospect@exemple.test",
    cabinetName,
    vetCount: "2",
    locale: "fr",
  });

describe("demande de démo", () => {
  it.each([
    "Clinique vétérinaire des Tilleuls",
    "Cabinet Saint-Martin & associés",
    "Clinique Vét. du Parc (Lyon 3e)",
  ])("accepte le nom « %s »", (name) => {
    expect(request(name).success).toBe(true);
  });

  it.each([
    "Cabinet https://exemple.test",
    "Voir www.exemple.test",
    "Écrire à contact@exemple.test",
    "Cabinet\nOuvrir la démo : exemple.test",
    "Cabinet​caché",
    "<b>Cabinet</b>",
  ])(
    "refuse un nom qui porte un lien, une adresse ou un caractère caché",
    (name) => {
      expect(request(name).error?.issues[0]?.message).toBe("cabinet_chars");
    },
  );
});
