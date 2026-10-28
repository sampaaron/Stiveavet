import type { ActivityStats } from "./statistiques";

/**
 * Temps gagné par le cabinet (cahier des charges §17, ADR 0046) : une estimation prudente,
 * dont le calcul est montré à l'équipe.
 * - Chaque prise de nouvelles faite par Numa (premier message, étape programmée) remplace un
 *   appel de l'équipe au propriétaire : composer, rappeler s'il ne répond pas, noter.
 * - Chaque suivi lancé coûte le temps de relire la fiche et de cliquer.
 * Les réponses de Numa aux questions des propriétaires ne sont pas comptées.
 */
export const CHECK_IN_CALL_MINUTES = 4;
export const LAUNCH_MINUTES = 1;

export type TimeSaved = { minutes: number; checkIns: number };

export function timeSaved(
  stats: Pick<ActivityStats, "checkIns" | "launched">,
): TimeSaved {
  return {
    minutes: Math.max(
      0,
      stats.checkIns * CHECK_IN_CALL_MINUTES - stats.launched * LAUNCH_MINUTES,
    ),
    checkIns: stats.checkIns,
  };
}
