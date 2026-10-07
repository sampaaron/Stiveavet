import type { Locale } from "@/i18n/locales";

import { en } from "./en";
import { fr } from "./fr";
import type { SiteDictionary } from "./types";

const dictionaries: Record<Locale, SiteDictionary> = { fr, en };

export function siteDictionary(locale: Locale): SiteDictionary {
  return dictionaries[locale];
}

/** Remplace les valeurs {nom} d'un texte ; une valeur manquante est une erreur de développement. */
export function fill(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`Valeur manquante : ${name}`);
    return String(value);
  });
}

export type { SiteDictionary } from "./types";
