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
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time_format");

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
