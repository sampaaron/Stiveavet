/** Dates affichées dans l'interface : français, heure de Paris (cabinets en France). */
const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Paris",
});

const dateTimeFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

export function formatDate(value: Date): string {
  return dateFormat.format(value);
}

export function formatDateTime(value: Date): string {
  return dateTimeFormat.format(value);
}

const inputFormat = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Europe/Paris",
});

/** Valeur d'un champ `datetime-local` (`2026-10-07T20:00`), à l'heure de Paris. */
export function toDateTimeInput(value: Date): string {
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    inputFormat.formatToParts(value).find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

const timeFormat = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

export function formatTime(value: Date): string {
  return timeFormat.format(value);
}

const dayFormat = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Paris",
});

/** Jour courant pour un titre : « Mercredi 7 octobre ». */
export function formatDayTitle(value: Date): string {
  const label = dayFormat.format(value);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const weekdayFormat = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  timeZone: "Europe/Paris",
});

const shortDateFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Paris",
});

const parisDay = (value: Date) =>
  Math.floor(
    Date.parse(
      `${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(value)}T00:00:00Z`,
    ) / 86_400_000,
  );

/**
 * Moment relatif, comme sur un téléphone : l'heure aujourd'hui, « Hier », le jour de la
 * semaine dans les six derniers jours, sinon la date courte.
 */
export function formatRelativeMoment(value: Date, now: Date): string {
  const days = parisDay(now) - parisDay(value);
  if (days <= 0) return formatTime(value);
  if (days === 1) return "Hier";
  if (days < 7) {
    const weekday = weekdayFormat.format(value);
    return weekday.charAt(0).toUpperCase() + weekday.slice(1);
  }
  return shortDateFormat.format(value);
}

/** Jour relatif suivi de l'heure : « Aujourd'hui, 14:30 », « Hier, 21:10 », « Lundi, 10:00 ». */
export function formatRelativeDayTime(value: Date, now: Date): string {
  const days = parisDay(now) - parisDay(value);
  const time = formatTime(value);
  if (days === 0) return `Aujourd'hui, ${time}`;
  if (days === 1) return `Hier, ${time}`;
  if (days === -1) return `Demain, ${time}`;
  if (Math.abs(days) < 7) {
    const weekday = weekdayFormat.format(value);
    return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${time}`;
  }
  return `${shortDateFormat.format(value)}, ${time}`;
}

/** Durée courte : « 20 min », « 1 h 30 ». */
export function formatDuration(start: Date, end: Date): string {
  const minutes = Math.max(
    Math.round((end.getTime() - start.getTime()) / 60_000),
    0,
  );
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`;
}

/** « Dr Claire Fontaine » devient « Dr Fontaine » ; un autre nom reste entier. */
export function shortPersonName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length >= 3 && /^(Dr|Pr)\.?$/i.test(parts[0] ?? ""))
    return `${parts[0]} ${parts.at(-1)}`;
  return displayName.trim();
}
