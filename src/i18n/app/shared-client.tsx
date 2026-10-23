"use client";

import type { Locale } from "@/i18n/locales";

import { shared as en } from "./en/shared";
import { shared as fr } from "./fr/shared";
import { useLocale } from "./locale-context";
import type { SharedDictionary } from "./types";

const dictionaries: Record<Locale, SharedDictionary> = { fr, en };

/**
 * Textes des composants partagés avec la vitrine (badges, assistants, fil), dans la langue de
 * la page. À préférer à `useAppText` dans ces composants : il n'embarque pas tout le
 * dictionnaire de l'espace cabinet dans le code envoyé au navigateur.
 */
export function useSharedText(): SharedDictionary {
  return dictionaries[useLocale()];
}
