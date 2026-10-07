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
