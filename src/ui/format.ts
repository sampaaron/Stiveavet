import type { Locale } from "@/i18n/locales";

/**
 * Dates affichées dans l'interface, dans la langue de la personne (ADR 0022) et toujours à
 * l'heure de Paris (cabinets en France). L'anglais suit l'usage britannique : jour, mois,
 * année et horloge sur 24 heures.
 */
const TIME_ZONE = "Europe/Paris";
const INTL: Record<Locale, string> = { fr: "fr-FR", en: "en-GB" };

const WORDS = {
  fr: { today: "Aujourd'hui", yesterday: "Hier", tomorrow: "Demain" },
  en: { today: "Today", yesterday: "Yesterday", tomorrow: "Tomorrow" },
} as const satisfies Record<Locale, Record<string, string>>;

type Options = Intl.DateTimeFormatOptions;
const cachedFormats = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: Locale, options: Options): Intl.DateTimeFormat {
  const key = `${locale}:${JSON.stringify(options)}`;
  let format = cachedFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(INTL[locale], {
      ...options,
      timeZone: TIME_ZONE,
    });
    cachedFormats.set(key, format);
  }
  return format;
}

const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

/** « 7 octobre 2026 », « 7 October 2026 ». */
export function formatDate(value: Date, locale: Locale): string {
  return formatter(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(value);
}

/** « 7 oct., 14:30 », « 7 Oct, 14:30 ». */
export function formatDateTime(value: Date, locale: Locale): string {
  return formatter(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

const inputFormat = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: TIME_ZONE,
});

/** Valeur d'un champ `datetime-local` (`2026-10-07T20:00`), à l'heure de Paris. */
export function toDateTimeInput(value: Date): string {
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    inputFormat.formatToParts(value).find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

/** « 14:30 » dans les deux langues. */
export function formatTime(value: Date, locale: Locale): string {
  return formatter(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(value);
}

/** Jour courant pour un titre : « Mercredi 7 octobre », « Wednesday 7 October ». */
export function formatDayTitle(value: Date, locale: Locale): string {
  return capitalize(
    formatter(locale, { weekday: "long", day: "numeric", month: "long" })
      .format(value)
      .replace(",", ""),
  );
}

const weekday = (value: Date, locale: Locale) =>
  capitalize(formatter(locale, { weekday: "long" }).format(value));

const shortDate = (value: Date, locale: Locale) =>
  formatter(locale, { day: "numeric", month: "short" }).format(value);

const parisDay = (value: Date) =>
  Math.floor(
    Date.parse(
      `${new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(value)}T00:00:00Z`,
    ) / 86_400_000,
  );

/**
 * Moment relatif, comme sur un téléphone : l'heure aujourd'hui, « Hier », le jour de la
 * semaine dans les six derniers jours, sinon la date courte.
 */
export function formatRelativeMoment(
  value: Date,
  now: Date,
  locale: Locale,
): string {
  const days = parisDay(now) - parisDay(value);
  if (days <= 0) return formatTime(value, locale);
  if (days === 1) return WORDS[locale].yesterday;
  if (days < 7) return weekday(value, locale);
  return shortDate(value, locale);
}

/** Jour relatif suivi de l'heure : « Aujourd'hui, 14:30 », « Yesterday, 21:10 », « Lundi, 10:00 ». */
export function formatRelativeDayTime(
  value: Date,
  now: Date,
  locale: Locale,
): string {
  const days = parisDay(now) - parisDay(value);
  const time = formatTime(value, locale);
  const words = WORDS[locale];
  if (days === 0) return `${words.today}, ${time}`;
  if (days === 1) return `${words.yesterday}, ${time}`;
  if (days === -1) return `${words.tomorrow}, ${time}`;
  if (Math.abs(days) < 7) return `${weekday(value, locale)}, ${time}`;
  return `${shortDate(value, locale)}, ${time}`;
}

/** Durée courte : « 20 min », « 1 h 30 » ; en anglais « 20 min », « 1 h 30 min ». */
export function formatDuration(start: Date, end: Date, locale: Locale): string {
  const minutes = Math.max(
    Math.round((end.getTime() - start.getTime()) / 60_000),
    0,
  );
  return formatMinutes(minutes, locale);
}

/** Nombre de minutes en durée courte, mêmes règles que `formatDuration`. */
export function formatMinutes(minutes: number, locale: Locale): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!rest) return `${hours} h`;
  return locale === "en"
    ? `${hours} h ${rest} min`
    : `${hours} h ${String(rest).padStart(2, "0")}`;
}

/** Montant en euros, centimes compris : « 86,00 € », « €86.00 ». */
export function formatEuros(cents: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL[locale], {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

/** « Dr Claire Fontaine » devient « Dr Fontaine » ; un autre nom reste entier. */
export function shortPersonName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length >= 3 && /^(Dr|Pr)\.?$/i.test(parts[0] ?? ""))
    return `${parts[0]} ${parts.at(-1)}`;
  return displayName.trim();
}
