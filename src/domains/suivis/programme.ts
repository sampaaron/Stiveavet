import { nextSendTime } from "./envoi";
import type { SendWindow } from "./envoi";
import { stepDueAt } from "./plan";

/**
 * Rappels et fin du suivi (cahier des charges §5 « Fin et relance », ADR 0018) : règles pures.
 * - Une étape part à son heure (intervention + délai), décalée au début de la plage d'envoi
 *   suivante du cabinet si elle tombe en dehors, à l'heure de Paris.
 * - Une étape n'est planifiée qu'une fois, après l'accord du propriétaire ; une étape déjà
 *   passée n'est jamais envoyée, sauf si elle vient de passer (au plus `CATCH_UP_HOURS`) :
 *   elle part alors tout de suite, pour que l'échange qui suit l'accord ait du sens.
 * - Le suivi automatisé s'arrête à la date de contrôle ; sans contrôle, 24 h après la
 *   dernière étape. Aucune étape ne part après cette fin.
 */

const HOUR = 3_600_000;
const CATCH_UP_HOURS = 2;
const END_WITHOUT_CONTROL_HOURS = 24;

/** Fin du suivi automatisé : rendez-vous de contrôle, sinon un jour après la dernière étape. */
export function automaticEndAt(input: {
  procedureAt: Date;
  controlAppointmentAt: Date | null;
  stepOffsets: readonly number[];
}): Date {
  if (input.controlAppointmentAt) return input.controlAppointmentAt;
  const last = Math.max(0, ...input.stepOffsets);
  return stepDueAt(input.procedureAt, last + END_WITHOUT_CONTROL_HOURS);
}

export type PlannedStep = { id: string; offsetHours: number };

/**
 * Étapes à planifier maintenant, avec leur heure d'envoi : à venir (ou tout juste passées)
 * et avant la fin du suivi automatisé.
 */
export function stepsToSchedule<Step extends PlannedStep>(input: {
  steps: readonly Step[];
  procedureAt: Date;
  endAt: Date;
  windows: readonly SendWindow[];
  now: Date;
}): { step: Step; dueAt: Date; runAt: Date }[] {
  const { procedureAt, endAt, windows, now } = input;
  const earliest = now.getTime() - CATCH_UP_HOURS * HOUR;
  return input.steps
    .map((step) => ({ step, dueAt: stepDueAt(procedureAt, step.offsetHours) }))
    .filter(
      ({ dueAt }) =>
        dueAt.getTime() >= earliest && dueAt.getTime() < endAt.getTime(),
    )
    .map(({ step, dueAt }) => ({
      step,
      dueAt,
      runAt: nextSendTime(
        windows,
        dueAt.getTime() < now.getTime() ? now : dueAt,
      ),
    }))
    .filter(({ runAt }) => runAt.getTime() < endAt.getTime());
}
