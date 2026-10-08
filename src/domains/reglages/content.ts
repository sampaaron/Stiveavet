import { z } from "zod";

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export const EMERGENCY_PERIODS = [
  "day",
  "night",
  "weekend",
  "holiday",
] as const;
export type EmergencyPeriod = (typeof EMERGENCY_PERIODS)[number];

/** Le délai d'escalade se règle entre 3 et 5 heures (cahier des charges §7). */
export const ESCALATION_CHOICES = [180, 210, 240, 270, 300] as const;

// Les messages de validation sont des codes, traduits par les actions (`settings.validation`).
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time_format");

export const windowInput = z
  .object({
    weekday: z.union(WEEKDAYS.map((day) => z.literal(day))),
    startsAt: time,
    endsAt: time,
  })
  .refine((value) => value.endsAt > value.startsAt, {
    message: "end_before_start",
  });
export type WindowInput = z.infer<typeof windowInput>;

export const messageWindowsInput = z
  .array(windowInput)
  .max(14)
  .refine(
    (windows) => new Set(windows.map((w) => w.weekday)).size === windows.length,
    { message: "one_window_per_day" },
  );

export const instructionsInput = z
  .string()
  .trim()
  .min(10, "instructions_short")
  .max(1500, "instructions_long");

export const contactInput = z.object({
  label: z
    .string()
    .trim()
    .min(2, "contact_label_short")
    .max(80, "contact_label_long"),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9 .]{5,19}$/, "phone_invalid"),
});

export const alertSettingsInput = z.object({
  escalationDelayMinutes: z.union(
    ESCALATION_CHOICES.map((value) => z.literal(value)),
  ),
  photoAnalysisEnabled: z.boolean(),
});

/** Réglages de départ : modifiables ensuite, à adapter par le cabinet. */
export const DEFAULT_MESSAGE_WINDOWS: WindowInput[] = [1, 2, 3, 4, 5, 6].map(
  (weekday) => ({
    weekday: weekday as WindowInput["weekday"],
    startsAt: "08:00",
    endsAt: "20:00",
  }),
);

/** Plages où Numa peut proposer un rendez-vous (lot 18) : en semaine, aux heures de consultation. */
export const DEFAULT_APPOINTMENT_WINDOWS: WindowInput[] = [1, 2, 3, 4, 5].map(
  (weekday) => ({
    weekday: weekday as WindowInput["weekday"],
    startsAt: "09:00",
    endsAt: "18:00",
  }),
);

const appointmentMinutes = z
  .int("duration_integer")
  .min(5, "duration_min")
  .max(120, "duration_max")
  .refine((value) => value % 5 === 0, "duration_step");

/** Durée de chaque type de rendez-vous proposé par Numa. */
export const appointmentDurationsInput = z.object({
  post_op_control: appointmentMinutes,
  emergency: appointmentMinutes,
  treatment_followup: appointmentMinutes,
  other: appointmentMinutes,
});

export const DEFAULT_INSTRUCTIONS: Record<EmergencyPeriod, string> = {
  day: "Appelez le cabinet sans attendre au numéro d'urgence indiqué ci-dessous. Si personne ne répond, rappelez dans quelques minutes.",
  night:
    "La nuit, appelez le numéro de garde indiqué ci-dessous. En cas de doute, n'attendez pas le matin pour appeler.",
  weekend:
    "Le week-end, appelez le numéro de garde indiqué ci-dessous. En cas de doute, n'attendez pas la réouverture du cabinet pour appeler.",
  holiday:
    "Les jours fériés, appelez le numéro de garde indiqué ci-dessous. En cas de doute, n'attendez pas la réouverture du cabinet pour appeler.",
};

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
