"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import { DEFAULT_LOCALE } from "@/i18n/locales";
import type { Locale } from "@/i18n/locales";

import { appDictionary } from "./index";
import type { AppDictionary } from "./types";

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

/** Dictionnaire de l'espace cabinet dans la langue de la page, pour un composant client. */
export function useAppText(): AppDictionary {
  return appDictionary(useContext(LocaleContext));
}
