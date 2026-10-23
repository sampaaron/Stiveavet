import { parisDayIndex } from "@/domains/heure-paris";

/** Jours calendaires écoulés à Paris entre deux instants (J+n), jamais négatif. */
export function daysSince(from: Date, now: Date): number {
  return Math.max(parisDayIndex(now) - parisDayIndex(from), 0);
}
