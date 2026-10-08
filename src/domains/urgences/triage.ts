import { parisWallMinutes } from "@/domains/reglages/content";
import type { EmergencyPeriod } from "@/domains/reglages/content";
import { DEFAULT_MESSAGE_WINDOWS } from "@/domains/reglages/content";
import type { SendWindow } from "@/domains/suivis/envoi";

import type { TriageReasonCode } from "./schema";

/**
 * Triage déterministe (cahier des charges §7) : trois niveaux, normal, à surveiller, urgent.
 * Aucune IA ici : des règles écrites, testées, qui ne posent aucun diagnostic. Elles
 * reconnaissent les signes d'alerte validés par le vétérinaire pour ce suivi, quelques
 * signaux d'urgence universels, et escaladent en cas de doute (inquiétude exprimée).
 */

export type TriageLevel = "normal" | "watch" | "urgent";

export type FollowupAlertRule = {
  id: string;
  level: "watch" | "urgent";
  description: string;
};

export type Assessment = {
  level: TriageLevel;
  /** Signe d'alerte du suivi reconnu, s'il y en a un. */
  ruleId: string | null;
  /** Explication courte (contenu clinique : jamais journalisée). */
  reason: string;
  /** Même motif, codé pour être affiché dans la langue du lecteur (ADR 0022). */
  code: TriageReasonCode;
};

const RANK: Record<TriageLevel, number> = { normal: 0, watch: 1, urgent: 2 };

export function higherLevel(a: TriageLevel, b: TriageLevel): TriageLevel {
  return RANK[a] >= RANK[b] ? a : b;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’`]/g, "'");
}

/** Signaux d'urgence reconnus quel que soit le protocole. */
const RED_FLAGS =
  /(respire (mal|difficilement|tres vite)|du mal a respirer|n'arrive (pas|plus) a respirer|etouff|convuls|crise d'epilepsie|s'est effondre|s'est evanoui|evanoui|inconscient|ne se leve plus|ne tient plus debout|saigne (beaucoup|abondamment|enormement)|saignement (abondant|important)|ne s'arrete pas de saigner|vomit du sang|sang dans (les|ses) (selles|vomi)|points? (sont |se sont )?(lache|ouvert|arrache)|plaie (grande )?ouverte|on voit (les|ses) (intestins|organes)|gencives (blanches|bleues|grises)|ventre (gonfle|dur et gonfle)|can'?t breathe|struggling to breathe|seizure|collapsed|unconscious|bleeding (heavily|a lot)|won'?t stop bleeding|vomiting blood|wound (is )?open|pale gums|blue gums)/;

/** Inquiétude ou signe clinique non reconnu : en cas de doute, Numa escalade. */
const CONCERN =
  /(saign|sang|vomi|diarrh|ne mange (pas|plus)|refuse de manger|boit (pas|plus)|gonfl|enfl|fievre|douleur|a mal|souffr|pleure|gemit|gemis|abattu|apathi|halet|plaie|pus|odeur|rouge|boite|tremble|leche (beaucoup|sans arret)|inquiet|est-ce grave|c'est grave|est-ce normal|bleed|blood|vomit|swollen|swelling|pain|not eating|won'?t eat|lethargic|wound|limp|worried|is it serious|is it normal)/;

const STOP_WORDS = new Set([
  "avec",
  "dans",
  "elle",
  "ils",
  "leur",
  "mais",
  "moins",
  "plus",
  "pour",
  "sans",
  "sont",
  "tres",
  "une",
  "des",
  "les",
  "qui",
  "que",
  "pas",
  "est",
  "fois",
  "jour",
  "jours",
  "heure",
  "heures",
  "apres",
  "avant",
  "depuis",
  "the",
  "and",
  "with",
  "from",
  "that",
  "this",
  "more",
  "than",
]);

/** Racines significatives d'un texte : mots de 4 lettres et plus, coupés à 5 lettres. */
function stems(text: string): string[] {
  return normalize(text)
    .split(/[^a-z]+/)
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word))
    .map((word) => word.slice(0, 5));
}

/**
 * Un signe d'alerte est reconnu si le message contient au moins deux de ses racines (ou la
 * seule qu'il a). Volontairement large : une fausse alerte coûte moins qu'un oubli.
 */
export function matchesRule(message: string, rule: FollowupAlertRule): boolean {
  const wanted = [...new Set(stems(rule.description))];
  if (!wanted.length) return false;
  const present = new Set(stems(message));
  const hits = wanted.filter((stem) => present.has(stem)).length;
  return hits >= Math.min(2, wanted.length);
}

export function assessOwnerMessage(
  body: string,
  rules: readonly FollowupAlertRule[],
): Assessment {
  const text = normalize(body);
  // Le signe d'alerte le plus grave reconnu l'emporte.
  const matched = rules
    .filter((rule) => matchesRule(body, rule))
    .sort((a, b) => RANK[b.level] - RANK[a.level])[0];
  if (RED_FLAGS.test(text) && matched?.level !== "urgent")
    return {
      level: "urgent",
      ruleId: matched?.id ?? null,
      reason: "Signal d'urgence reconnu dans le message du propriétaire.",
      code: "red_flag",
    };
  if (matched)
    return {
      level: matched.level,
      ruleId: matched.id,
      reason: `Signe d'alerte du suivi : ${matched.description}`.slice(0, 300),
      code: "rule",
    };
  if (CONCERN.test(text))
    return {
      level: "watch",
      ruleId: null,
      reason:
        "Inquiétude ou signe à vérifier, sans signe d'alerte reconnu : escaladé par prudence.",
      code: "concern",
    };
  return {
    level: "normal",
    ruleId: null,
    reason: "Aucun signe d'alerte.",
    code: "none",
  };
}

// Jours fériés et périodes ----------------------------------------------------------

/** Dimanche de Pâques (algorithme de Meeus), en date UTC à minuit. */
function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const iso = (date: Date) => date.toISOString().slice(0, 10);

/** Jours fériés nationaux en France métropolitaine (AAAA-MM-JJ). */
export function frenchHolidays(year: number): Set<string> {
  const sunday = easter(year);
  const shift = (days: number) =>
    iso(new Date(sunday.getTime() + days * 86_400_000));
  return new Set([
    `${year}-01-01`,
    shift(1), // lundi de Pâques
    `${year}-05-01`,
    `${year}-05-08`,
    shift(39), // Ascension
    shift(50), // lundi de Pentecôte
    `${year}-07-14`,
    `${year}-08-15`,
    `${year}-11-01`,
    `${year}-11-11`,
    `${year}-12-25`,
  ]);
}

const DAY_MINUTES = 24 * 60;

function minutesOf(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Période des consignes d'urgence, à l'heure de Paris : jour férié, puis heures du cabinet
 * (sa plage d'envoi des messages), puis week-end, sinon nuit.
 */
export function emergencyPeriod(
  at: Date,
  windows: readonly SendWindow[],
): EmergencyPeriod {
  const wall = parisWallMinutes(at);
  const dayStart = Math.floor(wall / DAY_MINUTES) * DAY_MINUTES;
  const day = new Date(dayStart * 60_000);
  if (frenchHolidays(day.getUTCFullYear()).has(iso(day))) return "holiday";
  const minute = wall - dayStart;
  // 1 = lundi … 7 = dimanche.
  const weekday = ((day.getUTCDay() + 6) % 7) + 1;
  const plan = windows.length ? windows : DEFAULT_MESSAGE_WINDOWS;
  const open = plan.some(
    (window) =>
      window.weekday === weekday &&
      minute >= minutesOf(window.startsAt) &&
      minute < minutesOf(window.endsAt),
  );
  if (open) return "day";
  return weekday >= 6 ? "weekend" : "night";
}

/** Heure d'escalade d'une urgence : délai du cabinet, toujours entre 3 et 5 heures. */
export function escalationTime(createdAt: Date, delayMinutes: number): Date {
  const minutes = Math.min(300, Math.max(180, Math.round(delayMinutes)));
  return new Date(createdAt.getTime() + minutes * 60_000);
}

/**
 * Qui est prévenu en premier : aux heures du cabinet, le vétérinaire responsable ; en dehors,
 * le vétérinaire de garde s'il y en a un. Un responsable qui n'est plus actif est remplacé
 * par la garde, puis par un vétérinaire administrateur.
 */
export function firstRecipient(input: {
  period: EmergencyPeriod;
  responsible: { membershipId: string; active: boolean };
  onCallMembershipId: string | null;
  fallbackAdminMembershipId: string | null;
}): string | null {
  const { period, responsible, onCallMembershipId } = input;
  if (period === "day" && responsible.active) return responsible.membershipId;
  if (onCallMembershipId) return onCallMembershipId;
  if (responsible.active) return responsible.membershipId;
  return input.fallbackAdminMembershipId;
}
