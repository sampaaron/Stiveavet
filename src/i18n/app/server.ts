import "server-only";

import { headers } from "next/headers";
import { cache } from "react";

import { DEFAULT_LOCALE, isLocale } from "@/i18n/locales";
import type { Locale } from "@/i18n/locales";

import { appDictionary } from "./index";
import type { AppDictionary } from "./types";

/**
 * Langue de la requête, posée par le proxy (`x-stivea-locale`) : celle de l'adresse sur le
 * site public, sinon le choix de la personne (cookie synchronisé avec son compte), sinon son
 * navigateur. Toujours réécrite par le proxy, jamais lue telle quelle du navigateur.
 */
export const uiLocale = cache(async (): Promise<Locale> => {
  const value = (await headers()).get("x-stivea-locale");
  return isLocale(value) ? value : DEFAULT_LOCALE;
});

/** Dictionnaire de l'espace cabinet pour la requête en cours, avec sa langue. */
export async function appText(): Promise<{
  t: AppDictionary;
  locale: Locale;
}> {
  const locale = await uiLocale();
  return { t: appDictionary(locale), locale };
}
