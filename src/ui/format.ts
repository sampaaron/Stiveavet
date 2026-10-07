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
