import { z } from "zod";

import {
  MAX_ALERTS,
  MAX_STEPS,
  alertInput,
  stepInput,
} from "@/domains/protocoles/content";

/**
 * Fiche de lancement d'un suivi (cahier des charges §4) : règles pures, sans base de données.
 * Les délais des étapes comptent en heures après l'intervention, comme dans les protocoles.
 */

const HOUR = 3_600_000;

/** Suggestion courante pour le premier message de Numa ; jamais imposée (§4). */
export const FIRST_CONTACT_SUGGESTION_HOURS = 3;
export const MAX_FIRST_CONTACT_HOURS = 168;
export const MAX_TREATMENTS = 20;

const text = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label} : ${min} caractère(s) minimum.`)
    .max(max, `${label} : ${max} caractères maximum.`);

export const treatmentInput = z.object({
  name: text(1, 120, "Traitement"),
  instructions: text(1, 300, "Posologie"),
});

export const sheetInput = z.object({
  /** Brouillon seulement : le vétérinaire au nom duquel Numa écrira. */
  responsibleMembershipId: z.uuid().optional(),
  /** Brouillon seulement : heures entre l'intervention et le premier message. */
  firstContactHours: z
    .int("Premier message : un nombre d'heures entier.")
    .min(0, "Premier message : le délai ne peut pas être négatif.")
    .max(
      MAX_FIRST_CONTACT_HOURS,
      `Premier message : ${MAX_FIRST_CONTACT_HOURS} heures maximum après l'intervention.`,
    )
    .optional(),
  controlAppointmentAt: z.date().nullable(),
  /** Étapes à venir (les étapes passées d'un suivi en cours ne sont jamais renvoyées). */
  steps: z.array(stepInput).max(MAX_STEPS, `${MAX_STEPS} étapes au maximum.`),
  alerts: z
    .array(alertInput)
    .min(1, "Gardez au moins un signe d'alerte.")
    .max(MAX_ALERTS, `${MAX_ALERTS} signes d'alerte au maximum.`),
  validateTreatmentIds: z.array(z.uuid()).max(MAX_TREATMENTS),
  removeTreatmentIds: z.array(z.uuid()).max(MAX_TREATMENTS),
  addTreatments: z
    .array(treatmentInput)
    .max(MAX_TREATMENTS, `${MAX_TREATMENTS} traitements au maximum.`),
});
export type SheetInput = z.infer<typeof sheetInput>;

export function stepDueAt(procedureAt: Date, offsetHours: number): Date {
  return new Date(procedureAt.getTime() + offsetHours * HOUR);
}

/** Une étape dont l'heure est passée ne se modifie plus : elle a pu être envoyée. */
export function isPastStep(
  procedureAt: Date,
  offsetHours: number,
  now: Date,
): boolean {
  return stepDueAt(procedureAt, offsetHours).getTime() <= now.getTime();
}

export function firstContactAt(procedureAt: Date, hours: number): Date {
  return stepDueAt(procedureAt, hours);
}

/** Heures entières entre l'intervention et le premier message (pour réafficher la fiche). */
export function firstContactHours(procedureAt: Date, at: Date): number {
  return Math.max(0, Math.round((at.getTime() - procedureAt.getTime()) / HOUR));
}

/** Minuscules sans accents. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export type ProtocolCandidate = {
  versionId: string;
  name: string;
  description: string;
  species: "dog" | "cat" | "both";
};

/** Protocoles applicables à l'espèce de l'animal. */
export function fitsSpecies(
  candidate: Pick<ProtocolCandidate, "species">,
  species: "dog" | "cat",
): boolean {
  return candidate.species === "both" || candidate.species === species;
}

/**
 * Protocole proposé pour une intervention : celui dont le nom et la description reprennent le
 * plus de mots de l'intervention, l'espèce exacte l'emportant sur « chien et chat ».
 * Null si rien ne correspond : le vétérinaire choisit lui-même.
 */
export function suggestProtocol(
  procedure: string,
  species: "dog" | "cat",
  candidates: readonly ProtocolCandidate[],
): string | null {
  const words = normalize(procedure)
    .split(/[^a-z]+/)
    .filter((word) => word.length >= 5);
  let best: { versionId: string; score: number } | null = null;
  for (const candidate of candidates) {
    if (!fitsSpecies(candidate, species)) continue;
    const haystack = normalize(`${candidate.name} ${candidate.description}`);
    const matches = words.filter((word) => haystack.includes(word)).length;
    if (matches === 0) continue;
    const score = matches * 2 + (candidate.species === species ? 1 : 0);
    if (!best || score > best.score)
      best = { versionId: candidate.versionId, score };
  }
  return best?.versionId ?? null;
}

/** Numéro masqué pour l'écran : seuls les deux derniers chiffres restent lisibles. */
export function maskedPhone(phone: string): string {
  return `•• •• •• •• ${phone.replace(/\D/g, "").slice(-2)}`;
}
