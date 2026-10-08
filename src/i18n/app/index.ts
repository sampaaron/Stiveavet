import type { Locale } from "@/i18n/locales";

import { en } from "./en";
import { fr } from "./fr";
import type { AppDictionary } from "./types";

const dictionaries: Record<Locale, AppDictionary> = { fr, en };

/** Textes de l'espace cabinet et des pages de connexion, dans la langue demandée (ADR 0022). */
export function appDictionary(locale: Locale): AppDictionary {
  return dictionaries[locale];
}

export type { AppDictionary } from "./types";
