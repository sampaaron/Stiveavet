/** Langues du site public et de Numa (cahier des charges §2) ; le français est la langue par défaut. */
export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (LOCALES as readonly string[]).includes(value)
  );
}

/** Langue préférée d'après l'en-tête `Accept-Language` : la première, français ou anglais. */
export function preferredLocale(acceptLanguage: string | null): Locale | null {
  const found = (acceptLanguage ?? "")
    .split(",")
    .map((part) => part.trim().slice(0, 2).toLowerCase())
    .find(isLocale);
  return found ?? null;
}

/** Prix en euros : sans décimales s'il est rond (86 €), avec sinon (2,50 €). */
export function formatPrice(cents: number, locale: Locale): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })
    .format(cents / 100)
    .replace(/[  ]/g, " ");
}
