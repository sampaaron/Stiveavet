"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import { DEFAULT_LOCALE } from "@/i18n/locales";
import type { Locale } from "@/i18n/locales";

/**
 * Langue de la requête pour les composants clients. Sans dictionnaire : la mise en page
 * racine la pose partout, vitrine comprise, sans y embarquer les textes de l'espace cabinet.
 */
const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** Posé une fois par la mise en page racine, avec la langue de la requête. */
export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}
