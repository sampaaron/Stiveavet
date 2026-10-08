import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Garde-fou du lot 19 (ADR 0022) : les écrans de l'espace cabinet et de connexion ne
 * contiennent plus de texte écrit en dur ; tout passe par les dictionnaires. Repère simple :
 * hors commentaires, aucun caractère accentué du français dans le code de ces écrans.
 */
const ROOTS = ["src/app/app", "src/app/(auth)", "src/ui"];
const FILES = ["src/app/language-switch.tsx", "src/app/locale-actions.ts"];
// Tableau des mots relatifs par langue, propre aux formats de date.
const EXCLUDED = new Set(["src/ui/format.ts"]);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Retire les commentaires en gardant les numéros de ligne. */
function withoutComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ""))
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

describe("textes de l'espace cabinet", () => {
  it("aucun texte français écrit en dur dans les écrans", () => {
    const offenders: string[] = [];
    for (const file of [...ROOTS.flatMap(sources), ...FILES]) {
      if (EXCLUDED.has(file)) continue;
      withoutComments(readFileSync(file, "utf8"))
        .split("\n")
        .forEach((line, index) => {
          if (/[àâçéèêëîïôûùœÀÂÇÉÈÊÎÔÛ«»]/.test(line))
            offenders.push(`${file}:${index + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
