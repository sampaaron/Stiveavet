import { describe, expect, it } from "vitest";

import { fakeAiGateway } from "./fake";
import { simulatedStiveReply } from "./simulated-stive";
import type { StiveCase } from "./types";

const plume: StiveCase = {
  animal: "Plume",
  species: "cat",
  status: "active",
  clinical: {
    procedure: "Ovariectomie",
    dayNumber: 3,
    triage: "watch",
    breed: null,
    ageYears: 2,
    weightKg: 3.6,
    treatments: [
      { name: "Méloxicam", instructions: "1 fois par jour", validated: false },
    ],
    allergies: [],
    antecedents: [],
    openAlerts: [{ level: "watch", status: "open" }],
    recentExchanges: [
      { dayNumber: 2, from: "owner", text: "Elle lèche sa plaie", media: null },
    ],
  },
};

const ask = (
  text: string,
  file: StiveCase | null = null,
  language: "fr" | "en" = "fr",
) =>
  simulatedStiveReply({
    language,
    turns: [{ from: "vet", text }],
    case: file,
  }).text;

describe("Stive simulé", () => {
  it("se présente comme une IA et dit qu'il est simulé", () => {
    const text = ask("Bonjour Stive");
    expect(text).toContain("assistant IA");
    expect(text).toContain("Réponse simulée");
  });

  it("s'appuie sur ce que le dossier contient, sans rien inventer", () => {
    const text = ask("Fais-moi le point sur Plume", plume);
    expect(text).toContain("Plume (chat) — Ovariectomie, J+3");
    expect(text).toContain("à surveiller");
    expect(text).toContain("Méloxicam (pas encore validé)");
    expect(text).toContain("« Elle lèche sa plaie »");
    expect(text).not.toMatch(/allergie/i);
  });

  it("sans accès clinique, le dit plutôt que de deviner", () => {
    expect(ask("Comment va Plume ?", { ...plume, clinical: null })).toContain(
      "sans accès clinique",
    );
  });

  it("signale l'urgence en premier", () => {
    const text = ask("Le chien opéré hier a du mal, il convulse");
    expect(
      text.startsWith("Ce que vous décrivez peut relever de l'urgence"),
    ).toBe(true);
  });

  it("laisse la prescription au vétérinaire", () => {
    expect(ask("Quelle dose de méloxicam pour un chat ?")).toContain(
      "la prescription reste votre décision",
    );
  });

  it("propose une trame de message pour un propriétaire", () => {
    expect(ask("Aide-moi à rédiger un message au propriétaire")).toContain(
      "trame de message",
    );
  });

  it("répond en anglais quand l'interface est en anglais", async () => {
    const reply = await fakeAiGateway.stiveChat({
      language: "en",
      turns: [{ from: "vet", text: "How is Plume?" }],
      case: plume,
    });
    expect(reply.text).toContain("Ovariectomie, day 3");
    expect(reply.text).toContain("Simulated reply");
  });

  it("reste déterministe", () => {
    expect(ask("Organisation de la semaine ?")).toBe(
      ask("Organisation de la semaine ?"),
    );
  });
});
