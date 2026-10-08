import { z } from "zod";

/** Contenu d'une version de protocole : ce qui est figé à chaque enregistrement. */

export const PROTOCOL_CATEGORIES = [
  "surgery",
  "dental",
  "treatment",
  "other",
] as const;
export const PROTOCOL_SPECIES = ["dog", "cat", "both"] as const;
export const STEP_KINDS = [
  "message",
  "question",
  "photo_request",
  "reminder",
  "control",
] as const;
export const ALERT_LEVELS = ["watch", "urgent"] as const;

export const MAX_STEPS = 30;
export const MAX_ALERTS = 20;

/**
 * Les messages des refus sont des codes stables (`<champ>_short`, `<champ>_long`…), traduits
 * par l'écran (`protocols.validation`, ADR 0022) ; jamais de texte affiché ici.
 */
const text = (min: number, max: number, field: string) =>
  z.string().trim().min(min, `${field}_short`).max(max, `${field}_long`);

export const stepInput = z.object({
  offsetHours: z
    .number()
    .int("step_offset_integer")
    .min(0, "step_offset_negative")
    .max(2160, "step_offset_max"),
  kind: z.enum(STEP_KINDS),
  content: text(2, 1000, "step_content"),
});

export const alertInput = z.object({
  level: z.enum(ALERT_LEVELS),
  description: text(2, 300, "alert_description"),
});

export const protocolContentInput = z
  .object({
    name: text(2, 120, "name"),
    category: z.enum(PROTOCOL_CATEGORIES),
    species: z.enum(PROTOCOL_SPECIES),
    description: z.string().trim().max(2000, "description_long"),
    durationDays: z
      .number()
      .int("duration_integer")
      .min(1, "duration_min")
      .max(90, "duration_max"),
    steps: z.array(stepInput).min(1, "steps_min").max(MAX_STEPS, "steps_max"),
    alerts: z
      .array(alertInput)
      .min(1, "alerts_min")
      .max(MAX_ALERTS, "alerts_max"),
  })
  .refine(
    (value) =>
      value.steps.every((step) => step.offsetHours <= value.durationDays * 24),
    {
      message: "step_after_end",
      path: ["steps"],
    },
  );

export type ProtocolContent = z.infer<typeof protocolContentInput>;
