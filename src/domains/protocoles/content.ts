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

export const CATEGORY_LABELS: Record<
  (typeof PROTOCOL_CATEGORIES)[number],
  string
> = {
  surgery: "Chirurgie",
  dental: "Dentaire",
  treatment: "Suivi de traitement",
  other: "Autre",
};

export const SPECIES_LABELS: Record<(typeof PROTOCOL_SPECIES)[number], string> =
  {
    dog: "Chien",
    cat: "Chat",
    both: "Chien et chat",
  };

export const STEP_KIND_LABELS: Record<(typeof STEP_KINDS)[number], string> = {
  message: "Message",
  question: "Question",
  photo_request: "Demande de photo",
  reminder: "Rappel",
  control: "Rendez-vous de contrôle",
};

export const ALERT_LEVEL_LABELS: Record<(typeof ALERT_LEVELS)[number], string> =
  {
    watch: "À surveiller",
    urgent: "Urgent",
  };

export const MAX_STEPS = 30;
export const MAX_ALERTS = 20;

const text = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label} : ${min} caractères minimum.`)
    .max(max, `${label} : ${max} caractères maximum.`);

export const stepInput = z.object({
  offsetHours: z
    .number()
    .int("Délai en heures entières.")
    .min(0, "Le délai ne peut pas être négatif.")
    .max(2160, "Délai de 90 jours maximum."),
  kind: z.enum(STEP_KINDS),
  content: text(2, 1000, "Étape"),
});

export const alertInput = z.object({
  level: z.enum(ALERT_LEVELS),
  description: text(2, 300, "Signe d'alerte"),
});

export const protocolContentInput = z
  .object({
    name: text(2, 120, "Nom"),
    category: z.enum(PROTOCOL_CATEGORIES),
    species: z.enum(PROTOCOL_SPECIES),
    description: z
      .string()
      .trim()
      .max(2000, "Description : 2000 caractères maximum."),
    durationDays: z
      .number()
      .int("Durée en jours entiers.")
      .min(1, "Durée d'au moins 1 jour.")
      .max(90, "Durée de 90 jours maximum."),
    steps: z
      .array(stepInput)
      .min(1, "Ajoutez au moins une étape.")
      .max(MAX_STEPS, `${MAX_STEPS} étapes maximum.`),
    alerts: z
      .array(alertInput)
      .min(1, "Ajoutez au moins un signe d'alerte.")
      .max(MAX_ALERTS, `${MAX_ALERTS} signes d'alerte maximum.`),
  })
  .refine(
    (value) =>
      value.steps.every((step) => step.offsetHours <= value.durationDays * 24),
    {
      message: "Une étape tombe après la fin du suivi.",
      path: ["steps"],
    },
  );

export type ProtocolContent = z.infer<typeof protocolContentInput>;

/** « 4 h après », « J+1 », « J+10 » : délai lisible. */
export function offsetLabel(offsetHours: number): string {
  if (offsetHours < 24) return `${offsetHours} h après`;
  const days = Math.floor(offsetHours / 24);
  const hours = offsetHours % 24;
  return hours ? `J+${days}, ${hours} h` : `J+${days}`;
}
