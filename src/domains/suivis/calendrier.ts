import { parisWallMinutes } from "@/domains/reglages/content";

/** Numéro du jour calendaire à Paris (jours depuis l'époque Unix, heure locale). */
export function parisDayIndex(instant: Date): number {
  return Math.floor(parisWallMinutes(instant) / 1440);
}

/** Jours calendaires écoulés à Paris entre deux instants (J+n), jamais négatif. */
export function daysSince(from: Date, now: Date): number {
  return Math.max(parisDayIndex(now) - parisDayIndex(from), 0);
}
