import { describe, expect, it } from "vitest";

import { checkNumaReply } from "@/domains/conversations/guard";

import { draftMessage } from "./brouillons";

const base = {
  vetName: "Dr Claire Fontaine",
  practiceName: "Clinique des Tilleuls",
  animalName: "Moka",
};

describe("brouillons de Stive", () => {
  it("salue les destinataires et signe au nom du vétérinaire", () => {
    expect(
      draftMessage("news", {
        ...base,
        language: "fr",
        recipients: ["Julien", "Sophie"],
      }),
    ).toBe(
      "Bonjour Julien et Sophie, c'est Dr Claire Fontaine, du cabinet Clinique des Tilleuls. Je prends des nouvelles de Moka : comment se passe la journée ? Vous pouvez me répondre ici.",
    );
    expect(
      draftMessage("photo", { ...base, language: "en", recipients: ["Harry"] }),
    ).toBe(
      "Hello Harry, this is Dr Claire Fontaine from Clinique des Tilleuls. Could you send me a recent photo of Moka, taken in daylight? Thank you.",
    );
    expect(
      draftMessage("call", { ...base, language: "fr", recipients: [] }),
    ).toMatch(/^Bonjour, c'est Dr Claire Fontaine/);
  });

  it("ne contient jamais de diagnostic, de dose ni de réassurance", () => {
    for (const template of ["news", "photo", "call"] as const)
      for (const language of ["fr", "en"] as const)
        expect(
          checkNumaReply(
            draftMessage(template, { ...base, language, recipients: ["A"] }),
          ),
        ).toEqual({ ok: true });
  });
});
