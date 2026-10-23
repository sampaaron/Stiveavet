import { z } from "zod";

import { toE164 } from "@/domains/whatsapp/numero";
import { parisDate } from "@/domains/heure-paris";

/**
 * Saisie du registre (animal et propriétaires), validée côté serveur. Les messages d'erreur
 * sont des clés stables, traduites par l'interface : jamais la valeur saisie.
 */

export const MAX_OWNERS = 2;
const NOTES_MAX = 2000;
const WEIGHT_MAX_KG = 150;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

const ownerInput = z.object({
  fullName: z.string().trim().min(2).max(160),
  phone: z
    .string()
    .trim()
    .max(30)
    .transform((value, context) => {
      const phone = toE164(value);
      if (!phone) {
        context.addIssue({ code: "custom", message: "phone" });
        return z.NEVER;
      }
      return phone;
    }),
  email: z
    .string()
    .trim()
    .max(254)
    .transform((value, context) => {
      if (value === "") return null;
      if (!z.email().safeParse(value).success) {
        context.addIssue({ code: "custom", message: "email" });
        return z.NEVER;
      }
      return value.toLowerCase();
    }),
  language: z.enum(["fr", "en"]),
});

export type OwnerInput = z.output<typeof ownerInput>;

function animalInput(now: Date = new Date()) {
  return z.object({
    name: z.string().trim().min(1).max(80),
    species: z.enum(["dog", "cat"]),
    breed: optionalText(80),
    sex: z
      .enum(["female", "male", ""])
      .transform((value) => (value === "" ? null : value)),
    neutered: z
      .enum(["yes", "no", ""])
      .transform((value) => (value === "" ? null : value === "yes")),
    birthDate: z
      .string()
      .trim()
      .transform((value, context) => {
        if (value === "") return null;
        // Jamais dans le futur, au jour de Paris.
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
          value > parisDate(now) ||
          value < "1990-01-01"
        ) {
          context.addIssue({ code: "custom", message: "birthDate" });
          return z.NEVER;
        }
        return value;
      }),
    weightKg: z
      .string()
      .trim()
      .transform((value, context) => {
        if (value === "") return null;
        const kg = Number(value.replace(",", "."));
        if (!Number.isFinite(kg) || kg <= 0 || kg > WEIGHT_MAX_KG) {
          context.addIssue({ code: "custom", message: "weight" });
          return z.NEVER;
        }
        return Math.round(kg * 1000);
      }),
    notes: optionalText(NOTES_MAX),
  });
}

export const patientInput = (now?: Date) =>
  z.object({
    animal: animalInput(now),
    owners: z.array(ownerInput).min(1).max(MAX_OWNERS),
  });

export type PatientInput = z.output<ReturnType<typeof patientInput>>;

export const registryFilters = z.object({
  query: z.string().trim().max(80).catch(""),
  species: z.enum(["dog", "cat", "all"]).catch("all"),
  status: z.enum(["active", "followed", "archived", "all"]).catch("active"),
});

export type RegistryFilters = z.output<typeof registryFilters>;

/** Brouillon de suivi depuis la fiche : intervention, date, contrôle et protocole. */
export const manualFollowupInput = z.object({
  procedure: z.string().trim().min(3).max(160),
  procedureAt: z.date(),
  controlAppointmentAt: z.date().nullable(),
  protocolId: z.uuid().nullable(),
});

export type ManualFollowupInput = z.output<typeof manualFollowupInput>;

/** Âge lisible en mois révolus (null si la date de naissance est inconnue). */
export function ageInMonths(
  birthDate: string | null,
  now: Date,
): number | null {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const [ty, tm, td] = parisDate(now).split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const months = (ty - y) * 12 + (tm - m) - (td < d ? 1 : 0);
  return Math.max(months, 0);
}
