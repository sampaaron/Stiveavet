import { describe, expect, it } from "vitest";

import { en } from "./en";
import { fr } from "./fr";
import { fill } from "./index";

type Tree = string | Tree[] | { [key: string]: Tree };

/** Structure d'un dictionnaire : clés et longueurs de listes, sans les textes. */
function shape(value: Tree): unknown {
  if (typeof value === "string") return "texte";
  if (Array.isArray(value)) return value.map(shape);
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, shape(child)]),
  );
}

function strings(value: Tree, path = ""): Array<[string, string]> {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value))
    return value.flatMap((child, index) => strings(child, `${path}[${index}]`));
  return Object.entries(value).flatMap(([key, child]) =>
    strings(child, path ? `${path}.${key}` : key),
  );
}

const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

// Textes volontairement vides en français : notes propres à l'anglais.
const ENGLISH_ONLY = new Set(["common.appInFrench", "demo.space.languageNote"]);

describe("dictionnaires du site", () => {
  it("le français et l'anglais ont exactement la même structure", () => {
    expect(shape(en as Tree)).toEqual(shape(fr as Tree));
  });

  it("aucun texte n'est vide, et chaque traduction garde les mêmes valeurs à remplacer", () => {
    const english = new Map(strings(en as Tree));
    for (const [path, text] of strings(fr as Tree)) {
      const translation = english.get(path) ?? "";
      if (!ENGLISH_ONLY.has(path)) expect(text.trim(), path).not.toBe("");
      expect(translation.trim(), path).not.toBe("");
      expect(placeholders(translation), path).toEqual(placeholders(text));
    }
  });

  it("présente toujours Numa et Stive comme des IA", () => {
    expect(fr.common.numaAi).toBe("Assistante IA");
    expect(fr.common.stiveAi).toBe("Assistant IA");
    expect(en.common.numaAi).toBe("AI assistant");
    expect(en.common.stiveAi).toBe("AI assistant");
  });

  it("n'emploie jamais l'ancien nom de marque", () => {
    for (const [path, text] of [...strings(fr as Tree), ...strings(en as Tree)])
      expect(text, path).not.toMatch(/strivea/i);
  });

  it("remplace les valeurs et refuse une valeur manquante", () => {
    expect(fill("Essai à {price} HT", { price: "86 €" })).toBe(
      "Essai à 86 € HT",
    );
    expect(() => fill("{price}", {})).toThrow("Valeur manquante : price");
  });
});
