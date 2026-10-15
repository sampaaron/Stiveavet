import { describe, expect, it } from "vitest";

import {
  TEMPLATES,
  TEMPLATE_BODY_MAX,
  TEMPLATE_LANGUAGES,
  cleanParam,
  fillTemplate,
  metaParameters,
  renderTemplate,
  templateSubmissions,
} from "./modeles";
import type { TemplateKey } from "./modeles";

const keys = Object.keys(TEMPLATES) as TemplateKey[];

describe("catalogue des modèles WhatsApp", () => {
  it("chaque texte, en français et en anglais, utilise exactement ses paramètres déclarés", () => {
    for (const key of keys)
      for (const language of TEMPLATE_LANGUAGES) {
        const used = [
          ...TEMPLATES[key].text[language].matchAll(/\{\{([a-z_]+)\}\}/g),
        ].map((match) => match[1]);
        expect(new Set(used), `${key} ${language}`).toEqual(
          new Set(TEMPLATES[key].params),
        );
      }
  });

  it("respecte les règles de Meta : pas de paramètre isolé, au début ni à la fin ; 1 024 caractères au plus", () => {
    for (const submission of templateSubmissions()) {
      const [body] = submission.components;
      const text = body?.text ?? "";
      expect(text, submission.name).not.toMatch(/^\{\{/);
      expect(text, submission.name).not.toMatch(/\}\}[.!?]?$/);
      for (const line of text.split("\n"))
        expect(
          line.replace(/\{\{[a-z_]+\}\}/g, "").trim().length > 0 || line === "",
          submission.name,
        ).toBe(true);
      expect(submission.name).toMatch(/^[a-z0-9_]{1,512}$/);
      const examples = body?.example.body_text_named_params ?? [];
      const rendered = fillTemplate(
        submission.name,
        submission.language,
        examples.map((example) => example.example),
      );
      expect(rendered.length).toBeLessThanOrEqual(TEMPLATE_BODY_MAX);
      expect(rendered).not.toContain("{{");
    }
    expect(templateSubmissions()).toHaveLength(keys.length * 2);
  });

  it("rend le texte gardé et les paramètres envoyés à Meta à partir des mêmes valeurs", () => {
    const rendered = renderTemplate("suivi_cloture", "fr", {
      animal: "Caramel",
      practice: "Clinique des Tilleuls",
    });
    expect(rendered.params).toEqual(["Caramel", "Clinique des Tilleuls"]);
    expect(rendered.body).toContain(
      "Le suivi de Caramel prévu par Clinique des Tilleuls se termine aujourd'hui",
    );
    expect(metaParameters("suivi_cloture", rendered.params)).toEqual([
      { type: "text", parameter_name: "animal", text: "Caramel" },
      {
        type: "text",
        parameter_name: "practice",
        text: "Clinique des Tilleuls",
      },
    ]);
    expect(fillTemplate("suivi_cloture", "fr", rendered.params)).toBe(
      rendered.body,
    );
  });

  it("une valeur tient sur une ligne ; une valeur vide est refusée", () => {
    expect(cleanParam(" Pensez\nà la\tcollerette    ce soir ")).toBe(
      "Pensez à la collerette ce soir",
    );
    expect(() =>
      renderTemplate("suivi_cloture", "fr", { animal: " ", practice: "X" }),
    ).toThrow("Paramètre de modèle vide : animal");
    expect(() => fillTemplate("suivi_cloture", "fr", ["seul"])).toThrow();
  });
});
