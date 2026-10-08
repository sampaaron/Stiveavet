import { DEFAULT_LOCALE, isLocale, preferredLocale } from "./locales";
import type { Locale } from "./locales";

/**
 * Pages du site public (cahier des charges §14) et leur adresse dans chaque langue.
 * Toute adresse du site est produite ici : un lien ne peut pas viser une page inexistante.
 */
export const SITE_PAGES = {
  home: { fr: "", en: "" },
  how: { fr: "fonctionnement", en: "how-it-works" },
  numa: { fr: "numa", en: "numa" },
  stive: { fr: "stive", en: "stive" },
  integrations: { fr: "integrations", en: "integrations" },
  pricing: { fr: "tarifs", en: "pricing" },
  security: { fr: "securite", en: "security" },
  help: { fr: "aide", en: "help" },
  status: { fr: "statut", en: "status" },
  trial: { fr: "essai", en: "trial" },
  demo: { fr: "demo", en: "demo" },
  demoSpace: { fr: "demo/espace", en: "demo/workspace" },
  terms: { fr: "conditions", en: "terms" },
  privacy: { fr: "confidentialite", en: "privacy" },
  unsubscribe: { fr: "desinscription", en: "unsubscribe" },
} as const satisfies Record<string, Record<Locale, string>>;

export type SitePage = keyof typeof SITE_PAGES;

export function pathFor(page: SitePage, locale: Locale): string {
  const slug = SITE_PAGES[page][locale];
  return slug ? `/${locale}/${slug}` : `/${locale}`;
}

/** Page correspondant aux segments d'une adresse, dans la langue donnée. */
export function pageFor(
  locale: Locale,
  segments: readonly string[],
): SitePage | null {
  const slug = segments.join("/");
  for (const [page, slugs] of Object.entries(SITE_PAGES))
    if (slugs[locale] === slug) return page as SitePage;
  return null;
}

/** Langue d'une adresse : /en et /en/… sont en anglais, tout le reste en français. */
export function localeOfPath(pathname: string): Locale {
  return pathname === "/en" || pathname.startsWith("/en/") ? "en" : "fr";
}

/** Adresse du site public, dont la langue est fixée par l'adresse elle-même. */
function isSitePath(pathname: string): boolean {
  return /^\/(fr|en)(\/|$)/.test(pathname);
}

/**
 * Langue d'une requête (ADR 0022) : celle de l'adresse sur le site public ; ailleurs (espace
 * cabinet, connexion), le choix enregistré de la personne, sinon son navigateur, sinon le
 * français. Une valeur inconnue est ignorée.
 */
export function requestLocale(
  pathname: string,
  chosen: string | undefined,
  acceptLanguage: string | null,
): Locale {
  if (isSitePath(pathname)) return localeOfPath(pathname);
  if (isLocale(chosen)) return chosen;
  return preferredLocale(acceptLanguage) ?? DEFAULT_LOCALE;
}
