"use client";

import { appDictionary } from "./index";
import { useLocale } from "./locale-context";
import type { AppDictionary } from "./types";

export { LocaleProvider, useLocale } from "./locale-context";

/** Dictionnaire de l'espace cabinet dans la langue de la page, pour un composant client. */
export function useAppText(): AppDictionary {
  return appDictionary(useLocale());
}
