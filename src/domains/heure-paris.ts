/**
 * Heure murale de Paris, fuseau des cabinets : rappels, jour courant, horaires de garde. Le
 * serveur tourne en UTC ; n'utilisez jamais `getHours()` ni `toDateString()` pour une règle.
 */

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const PARIS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Paris",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** Heure de Paris d'un instant, en minutes depuis l'époque (pour calculer le décalage). */
export function parisWallMinutes(instant: Date): number {
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(
      PARIS.formatToParts(instant).find((p) => p.type === type)?.value ?? NaN,
    );
  return (
    Date.UTC(
      part("year"),
      part("month") - 1,
      part("day"),
      part("hour"),
      part("minute"),
    ) / 60_000
  );
}

/**
 * Date et heure saisies dans un champ `datetime-local`, lues à l'heure de Paris (fuseau du
 * cabinet). Renvoie `null` si la saisie est invalide.
 */
export function parisLocalToDate(value: string): Date | null {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const wall = Date.UTC(y, mo - 1, d, h, mi) / 60_000;
  // Deux passes : le décalage dépend de l'heure d'été au moment visé.
  let instant = wall;
  for (let pass = 0; pass < 2; pass += 1)
    instant = wall - (parisWallMinutes(new Date(instant * 60_000)) - instant);
  const date = new Date(instant * 60_000);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Numéro du jour calendaire à Paris (jours depuis l'époque Unix, heure locale). */
export function parisDayIndex(instant: Date): number {
  return Math.floor(parisWallMinutes(instant) / 1440);
}

/** Date du jour à Paris, « AAAA-MM-JJ ». */
export function parisDate(instant: Date): string {
  return new Date(parisDayIndex(instant) * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
