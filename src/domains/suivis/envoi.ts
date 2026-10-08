import {
  DEFAULT_MESSAGE_WINDOWS,
  parisLocalToDate,
  parisWallMinutes,
} from "@/domains/reglages/content";

import { minutesOfDay } from "@/domains/commun";

/**
 * Plage d'envoi des messages programmés (cahier des charges §3.5) : un message programmé ne
 * part que dans la plage du jour, à l'heure de Paris ; sinon au début de la plage suivante.
 * Les réponses aux messages du propriétaire ne sont pas concernées (Numa répond 24 h/24).
 */
export type SendWindow = { weekday: number; startsAt: string; endsAt: string };

const DAY_MINUTES = 24 * 60;

const pad = (value: number) => String(value).padStart(2, "0");

/** Premier instant d'envoi permis à partir de `at` (lui-même s'il tombe dans une plage). */
export function nextSendTime(windows: readonly SendWindow[], at: Date): Date {
  const plan = windows.length ? windows : DEFAULT_MESSAGE_WINDOWS;
  const wall = parisWallMinutes(at);
  const dayStart = Math.floor(wall / DAY_MINUTES) * DAY_MINUTES;
  const minuteOfDay = wall - dayStart;
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = new Date((dayStart + offset * DAY_MINUTES) * 60_000);
    // 1 = lundi … 7 = dimanche.
    const weekday = ((day.getUTCDay() + 6) % 7) + 1;
    const windowsOfDay = plan
      .filter((window) => window.weekday === weekday)
      .sort((a, b) => minutesOfDay(a.startsAt) - minutesOfDay(b.startsAt));
    for (const window of windowsOfDay) {
      const start = minutesOfDay(window.startsAt);
      const end = minutesOfDay(window.endsAt);
      if (offset === 0 && minuteOfDay >= start && minuteOfDay < end) return at;
      if (offset > 0 || minuteOfDay < start) {
        const local = `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}T${window.startsAt}`;
        const instant = parisLocalToDate(local);
        if (instant) return instant;
      }
    }
  }
  return at;
}
