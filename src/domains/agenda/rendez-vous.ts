import { foldText, minutesOfDay } from "@/domains/commun";
import { parisWallMinutes } from "@/domains/reglages/content";
import { renderTemplate } from "@/domains/whatsapp/modeles";
import type { RenderedTemplate } from "@/domains/whatsapp/modeles";

/**
 * Rendez-vous proposés par Numa (cahier des charges §8, ADR 0021) : règles pures, sans base.
 * - Numa ne propose qu'un créneau libre lu sur l'agenda du vétérinaire responsable (capture
 *   d'écran en attendant dr.veto) et compris dans une plage approuvée par le cabinet.
 * - Jamais un autre vétérinaire : sans créneau adapté, le cabinet rappelle.
 * - La durée dépend du type de rendez-vous, réglée par le cabinet.
 * La base revérifie les mêmes règles à l'insertion (migration 0014).
 */

export type AppointmentKind =
  "post_op_control" | "emergency" | "treatment_followup" | "other";

export const APPOINTMENT_KINDS: readonly AppointmentKind[] = [
  "post_op_control",
  "emergency",
  "treatment_followup",
  "other",
];

/** Durées proposées tant que le cabinet ne les a pas réglées. */
export const DEFAULT_APPOINTMENT_MINUTES: Record<AppointmentKind, number> = {
  post_op_control: 20,
  emergency: 30,
  treatment_followup: 20,
  other: 30,
};

/** Créneaux proposés au plus, délai minimal avant le rendez-vous, horizon de recherche. */
const MAX_OFFERED_SLOTS = 3;
const MIN_LEAD_MINUTES = 60;
export const SEARCH_HORIZON_DAYS = 14;

export type Interval = { startsAt: Date; endsAt: Date };
export type ApprovedWindow = {
  weekday: number;
  startsAt: string;
  endsAt: string;
};

const DAY_MINUTES = 24 * 60;

/** Le créneau tient-il, le même jour, dans une plage approuvée (heure de Paris) ? */
export function inApprovedWindow(
  windows: readonly ApprovedWindow[],
  startsAt: Date,
  endsAt: Date,
): boolean {
  const start = parisWallMinutes(startsAt);
  const end = parisWallMinutes(endsAt);
  const day = Math.floor(start / DAY_MINUTES);
  if (Math.floor((end - 1) / DAY_MINUTES) !== day) return false;
  // 1970-01-01 était un jeudi : 1 = lundi … 7 = dimanche.
  const weekday = ((day + 3) % 7) + 1;
  const from = start - day * DAY_MINUTES;
  const to = end - day * DAY_MINUTES;
  return windows.some(
    (window) =>
      window.weekday === weekday &&
      minutesOfDay(window.startsAt) <= from &&
      minutesOfDay(window.endsAt) >= to,
  );
}

const overlaps = (a: Interval, b: Interval) =>
  a.startsAt.getTime() < b.endsAt.getTime() &&
  a.endsAt.getTime() > b.startsAt.getTime();

/**
 * Débuts des créneaux à proposer : le début de chaque créneau libre capturé, si le rendez-vous
 * y tient en entier, dans une plage approuvée, sans chevaucher un rendez-vous existant ni un
 * créneau déjà proposé à un autre propriétaire. Dans l'ordre, les plus proches d'abord.
 */
export function fitSlots(input: {
  free: readonly Interval[];
  windows: readonly ApprovedWindow[];
  busy: readonly Interval[];
  minutes: number;
  now: Date;
  limit?: number;
}): Date[] {
  const earliest = input.now.getTime() + MIN_LEAD_MINUTES * 60_000;
  const latest =
    input.now.getTime() + SEARCH_HORIZON_DAYS * DAY_MINUTES * 60_000;
  const chosen: Date[] = [];
  const free = [...input.free].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  );
  for (const slot of free) {
    if (chosen.length >= (input.limit ?? MAX_OFFERED_SLOTS)) break;
    const candidate = {
      startsAt: slot.startsAt,
      endsAt: new Date(slot.startsAt.getTime() + input.minutes * 60_000),
    };
    if (candidate.startsAt.getTime() < earliest) continue;
    if (candidate.startsAt.getTime() > latest) continue;
    if (candidate.endsAt.getTime() > slot.endsAt.getTime()) continue;
    if (!inApprovedWindow(input.windows, candidate.startsAt, candidate.endsAt))
      continue;
    if (input.busy.some((busy) => overlaps(busy, candidate))) continue;
    if (
      chosen.some((start) => start.getTime() === candidate.startsAt.getTime())
    )
      continue;
    chosen.push(candidate.startsAt);
  }
  return chosen;
}

const APPOINTMENT_REQUEST =
  /(rendez[- ]?vous|\brdv\b|prendre (un )?creneau|un creneau|faire controler|passer au cabinet|venir au cabinet|appointment|book (a )?(visit|slot)|come (in|to the clinic))/;

/** Le propriétaire demande-t-il un rendez-vous ? (simple reconnaissance, sans IA) */
export function wantsAppointment(text: string): boolean {
  return APPOINTMENT_REQUEST.test(foldText(text));
}

/** Choix d'un créneau proposé : « 2 », « le 2 », « créneau 2 », « option 2 ». */
export function slotChoice(text: string): number | null {
  const match =
    /^\s*(?:(?:le|la|creneau|choix|option|n°|no|numero|number)\s*)?([1-3])\s*[.!)]?\s*$/.exec(
      foldText(text),
    );
  return match ? Number(match[1]) : null;
}

/** Type de rendez-vous d'un suivi : urgence si une urgence est ouverte, sinon selon le protocole. */
export function appointmentKindOf(
  category: "surgery" | "dental" | "treatment" | "other" | null,
  openUrgent: boolean,
): AppointmentKind {
  if (openUrgent) return "emergency";
  if (category === "surgery" || category === "dental") return "post_op_control";
  if (category === "treatment") return "treatment_followup";
  return "other";
}

const SLOT_FORMAT = {
  fr: new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }),
  en: new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }),
};

/** « mardi 13 octobre à 09:30 » ou « Tuesday 13 October at 09:30 », heure de Paris. */
export function slotLabel(at: Date, language: "fr" | "en"): string {
  const parts = SLOT_FORMAT[language].formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const date = `${value("weekday")} ${value("day")} ${value("month")}`;
  const time = `${value("hour")}:${value("minute")}`;
  return language === "en" ? `${date} at ${time}` : `${date} à ${time}`;
}

export type AppointmentWording = {
  language: "fr" | "en";
  ownerFirstName: string;
  animalName: string;
  practiceName: string;
  vetName: string;
};

/** Textes fixes de Numa pour les rendez-vous : aucun avis médical, le cabinet confirme. */
export function appointmentMessage(
  step:
    | { kind: "offer"; slots: readonly Date[] }
    | { kind: "callback" }
    | { kind: "chosen"; at: Date }
    | { kind: "unavailable" },
  c: AppointmentWording,
): string {
  const en = c.language === "en";
  switch (step.kind) {
    case "offer": {
      const lines = step.slots
        .map((at, index) => `${index + 1}. ${slotLabel(at, c.language)}`)
        .join("\n");
      const choices = step.slots
        .map((_, index) => index + 1)
        .join(en ? ", " : ", ");
      return en
        ? `Here are the next available slots with ${c.vetName} for ${c.animalName}:\n${lines}\n\nReply with the number of the slot you prefer (${choices}). The ${c.practiceName} team will then confirm the appointment.`
        : `Voici les prochains créneaux disponibles avec ${c.vetName} pour ${c.animalName} :\n${lines}\n\nRépondez par le numéro du créneau qui vous convient (${choices}). L'équipe de ${c.practiceName} confirmera ensuite le rendez-vous.`;
    }
    case "callback":
      return en
        ? `I don't have a suitable slot with ${c.vetName} at the moment. I've passed on your request: the ${c.practiceName} team will contact you to set an appointment. In an emergency, call the clinic directly.`
        : `Je n'ai pas de créneau adapté avec ${c.vetName} pour le moment. Je transmets votre demande : l'équipe de ${c.practiceName} vous recontactera pour fixer le rendez-vous. En cas d'urgence, appelez directement le cabinet.`;
    case "chosen":
      return en
        ? `Noted: I'm asking the ${c.practiceName} team to confirm the appointment on ${slotLabel(step.at, "en")} with ${c.vetName}. You will receive the confirmation here.`
        : `C'est noté : je demande à l'équipe de ${c.practiceName} de confirmer le rendez-vous du ${slotLabel(step.at, "fr")} avec ${c.vetName}. Vous recevrez la confirmation ici.`;
    case "unavailable":
      return en
        ? `Sorry, this slot is no longer available.`
        : `Désolée, ce créneau n'est plus disponible.`;
  }
}

/**
 * Décision du cabinet, souvent plusieurs heures après la demande : envoyée comme modèle
 * WhatsApp, elle part même hors de la fenêtre de 24 h (ADR 0024).
 */
export function appointmentDecisionMessage(
  step: { kind: "confirmed" | "declined"; at: Date },
  c: AppointmentWording,
): RenderedTemplate {
  const date = slotLabel(step.at, c.language);
  return step.kind === "confirmed"
    ? renderTemplate("rdv_confirme", c.language, {
        animal: c.animalName,
        date,
        vet: c.vetName,
        practice: c.practiceName,
      })
    : renderTemplate("rdv_annule", c.language, {
        date,
        practice: c.practiceName,
      });
}
