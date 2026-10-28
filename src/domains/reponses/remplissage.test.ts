import { describe, expect, it } from "vitest";

import { fillTemplate } from "./remplissage";

describe("modèles de réponse", () => {
  it("remplace chaque champ connu", () => {
    expect(
      fillTemplate(
        "Bonjour {proprietaire}, c'est {veterinaire} ({cabinet}). Nous avons bien reçu votre message au sujet de {animal}.",
        {
          proprietaire: "Antoine",
          veterinaire: "Dr Claire Fontaine",
          cabinet: "Clinique des Tilleuls",
          animal: "Plume",
        },
      ),
    ).toBe(
      "Bonjour Antoine, c'est Dr Claire Fontaine (Clinique des Tilleuls). Nous avons bien reçu votre message au sujet de Plume.",
    );
  });

  it("retire un champ sans valeur sans laisser d'accolades ni d'espace en trop", () => {
    expect(fillTemplate("Bonjour {proprietaire}, merci.", {})).toBe(
      "Bonjour, merci.",
    );
  });

  it("laisse intact ce qui n'est pas un champ", () => {
    expect(fillTemplate("Tarif {prix} et {animal}", { animal: "Plume" })).toBe(
      "Tarif {prix} et Plume",
    );
  });
});
