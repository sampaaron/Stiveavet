import { describe, expect, it } from "vitest";

import { en } from "./en";
import { fr } from "./fr";

type Text = (...args: never[]) => string;
type Tree = string | Text | Tree[] | { [key: string]: Tree };

/** Structure d'un dictionnaire : clés, longueurs de listes et nombre de paramètres. */
function shape(value: Tree): unknown {
  if (typeof value === "string") return "texte";
  if (typeof value === "function") return `fonction(${value.length})`;
  if (Array.isArray(value)) return value.map(shape);
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, shape(child)]),
  );
}

function leaves(value: Tree, path = ""): Array<[string, string | Text]> {
  if (typeof value === "string" || typeof value === "function")
    return [[path, value]];
  if (Array.isArray(value))
    return value.flatMap((child, index) => leaves(child, `${path}[${index}]`));
  return Object.entries(value).flatMap(([key, child]) =>
    leaves(child, path ? `${path}.${key}` : key),
  );
}

/**
 * Rend un texte : une fonction est appelée avec des valeurs d'essai reconnaissables (texte,
 * ou liste de textes pour une fonction qui attend une liste).
 */
function sample(leaf: string | Text): string {
  if (typeof leaf === "string") return leaf;
  const call = leaf as (...values: unknown[]) => string;
  const markers = Array.from({ length: leaf.length }, (_, i) => `«${i}»`);
  try {
    return call(...markers);
  } catch {
    return call(...markers.map((marker) => [marker]));
  }
}

const french = leaves(fr as unknown as Tree);
const english = new Map(leaves(en as unknown as Tree));

describe("dictionnaires de l'espace cabinet", () => {
  it("le français et l'anglais ont exactement la même structure", () => {
    expect(shape(en as unknown as Tree)).toEqual(shape(fr as unknown as Tree));
  });

  it("aucun texte n'est vide et chaque traduction reprend toutes les valeurs fournies", () => {
    for (const [path, leaf] of french) {
      const translation = english.get(path);
      expect(translation, path).toBeDefined();
      if (translation === undefined) continue;
      const text = sample(leaf);
      const translated = sample(translation);
      expect(text.trim(), path).not.toBe("");
      expect(translated.trim(), path).not.toBe("");
      // Une valeur passée au texte français doit aussi apparaître en anglais.
      for (const value of text.match(/«\d+»/g) ?? [])
        expect(translated, `${path} : ${value}`).toContain(value);
    }
  });

  it("présente toujours Numa et Stive comme des IA", () => {
    expect(fr.common.numaAi).toBe("Assistante IA");
    expect(fr.common.stiveAi).toBe("Assistant IA");
    expect(en.common.numaAi).toBe("AI assistant");
    expect(en.common.stiveAi).toBe("AI assistant");
    expect(en.ui.chat.numaAuthor).toContain("AI assistant");
  });

  it("n'emploie jamais l'ancien nom de marque", () => {
    for (const [path, leaf] of [...french, ...english])
      expect(sample(leaf), path).not.toMatch(/strivea/i);
  });

  it("aucun texte anglais n'est resté en français", () => {
    const frenchOnly =
      /[àâçéèêëîïôûùœ]|\b(le|la|les|des|du|une|est|pour|avec|vous|votre|aucun)\b/i;
    // Mots propres admis en anglais : noms de logiciels, lien vers la langue française.
    const allowed = new Set(["common.language.switchTo"]);
    for (const [path, leaf] of english) {
      if (allowed.has(path)) continue;
      const text = sample(leaf)
        .replace(/Vétocom|Stivea|dr\.veto/g, "")
        .replace(/«\d+»/g, "");
      expect(text, path).not.toMatch(frenchOnly);
    }
  });
});
