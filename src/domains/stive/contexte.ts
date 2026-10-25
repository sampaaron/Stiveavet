import { z } from "zod";

import type { StiveCase } from "@/adapters/ai-gateway/types";
import { foldText } from "@/domains/commun";
import { daysSince } from "@/domains/suivis/calendrier";
import type { FollowupRecord } from "@/domains/suivis/record";
import type { FollowupView } from "@/domains/suivis/service";

/**
 * Contexte du cabinet donné à Stive (ADR 0035). Fonctions pures : le service les applique à
 * ce que les services existants rendent pour la personne (RLS, accès au dossier, accès
 * clinique), sans jamais relire la base à côté. Seul le strict utile part au fournisseur IA.
 */

/** Longueur maximale d'un message du vétérinaire à Stive. */
export const STIVE_MESSAGE_MAX = 2000;

export const stiveMessageInput = z
  .string()
  .trim()
  .min(1)
  .max(STIVE_MESSAGE_MAX);

/**
 * Dossier choisi dans la conversation : `auto` (détection du prénom de l'animal), `none`
 * (aucun dossier), ou l'identifiant d'un suivi.
 */
export const stiveFollowupChoice = z.union([
  z.literal("auto"),
  z.literal("none"),
  z.uuid(),
]);
export type StiveFollowupChoice = z.infer<typeof stiveFollowupChoice>;

const RECENT_EXCHANGES = 8;
const EXCHANGE_MAX = 500;
const LIST_MAX = 8;
const TREATMENT_TEXT_MAX = 300;

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
/** Suite de 9 chiffres ou plus (un numéro), séparés ou non par des espaces, points ou tirets. */
const PHONE = /(?:\+|00)?\d(?:[\s.-]?\d){8,}/g;
const MASK = "[…]";

/** Retire adresses e-mail et numéros d'un texte libre avant tout envoi au fournisseur IA. */
export function maskContactData(text: string): string {
  return text.replace(EMAIL, MASK).replace(PHONE, MASK);
}

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Le mot (ou groupe de mots) figure-t-il tel quel dans le texte replié ? */
function mentions(folded: string, name: string): boolean {
  const target = foldText(name).trim();
  if (target.length < 2) return false;
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeRegExp(target)}($|[^\\p{L}\\p{N}])`,
    "u",
  ).test(folded);
}

export type StiveCandidate = Pick<
  FollowupView,
  "id" | "animalName" | "ownerName" | "status" | "startedAt"
>;

export type StiveDetection =
  | { kind: "none" }
  | { kind: "one"; followupId: string }
  | { kind: "ambiguous"; animalNames: string[] };

const STATUS_ORDER: Record<FollowupView["status"], number> = {
  active: 0,
  human_takeover: 0,
  paused: 1,
  draft: 2,
  ended: 3,
};

/**
 * Dossier évoqué par le prénom de l'animal (ou le nom de famille du propriétaire, quatre
 * lettres au moins) parmi les suivis que la personne voit. Plusieurs suivis du même animal :
 * le plus actuel. Deux animaux différents : ambigu, aucun dossier n'est pris.
 */
export function detectFollowup(
  message: string,
  candidates: readonly StiveCandidate[],
): StiveDetection {
  const folded = foldText(message);
  const matches = candidates.filter((candidate) => {
    if (mentions(folded, candidate.animalName)) return true;
    const family = candidate.ownerName?.trim().split(/\s+/).at(-1);
    return (
      family !== undefined && family.length >= 4 && mentions(folded, family)
    );
  });
  if (matches.length === 0) return { kind: "none" };
  const animals = new Set(
    matches.map(
      (match) =>
        `${foldText(match.animalName)}|${foldText(match.ownerName ?? "")}`,
    ),
  );
  if (animals.size > 1)
    return {
      kind: "ambiguous",
      animalNames: [...new Set(matches.map((match) => match.animalName))],
    };
  const [best] = [...matches].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0),
  );
  return best ? { kind: "one", followupId: best.id } : { kind: "none" };
}

function ageInYears(birthDate: string | null, now: Date): number | null {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  const years = (now.getTime() - birth.getTime()) / (365.25 * 86_400_000);
  return years >= 0 ? Math.round(years * 10) / 10 : null;
}

/**
 * Dossier réduit pour Stive : prénom et espèce de l'animal, statut ; avec l'accès clinique,
 * l'intervention, la priorité, les traitements, les antécédents et les derniers échanges
 * (coordonnées masquées). Jamais le nom ni le numéro d'un propriétaire, ni les noms de
 * l'équipe, ni un identifiant.
 */
export function buildStiveCase(
  followup: FollowupView,
  record: FollowupRecord,
  now: Date,
): StiveCase {
  const base = {
    animal: followup.animalName,
    species: followup.species,
    status: followup.status,
  };
  if (followup.access !== "clinical" || record.access !== "clinical")
    return { ...base, clinical: null };

  const facts = record.facts;
  const exchanges = record.messages
    .filter(
      (
        message,
      ): message is typeof message & { author: "owner" | "numa" | "vet" } =>
        message.author !== "system",
    )
    .map((message) => {
      const voice = message.attachments.find(
        (attachment) => attachment.kind === "voice" && attachment.transcript,
      );
      const text = message.body.trim() || voice?.transcript || "";
      return {
        dayNumber: daysSince(followup.procedureAt, message.occurredAt),
        from: message.author,
        text: clip(maskContactData(text), EXCHANGE_MAX),
        media: message.attachments[0]?.kind ?? null,
      };
    })
    .filter((exchange) => exchange.text || exchange.media)
    .slice(-RECENT_EXCHANGES);

  return {
    ...base,
    clinical: {
      procedure: clip(followup.procedure, 200),
      dayNumber: daysSince(followup.procedureAt, now),
      triage: followup.triage,
      breed: facts.animal.breed,
      ageYears: ageInYears(facts.animal.birthDate, now),
      weightKg:
        facts.animal.weightGrams === null
          ? null
          : Math.round(facts.animal.weightGrams / 100) / 10,
      treatments: facts.treatments.slice(0, LIST_MAX).map((treatment) => ({
        name: clip(treatment.name, 120),
        instructions: clip(
          maskContactData(treatment.instructions),
          TREATMENT_TEXT_MAX,
        ),
        validated: treatment.validatedBy !== null,
      })),
      allergies: (facts.imported?.allergies ?? [])
        .slice(0, LIST_MAX)
        .map((item) => clip(item, 120)),
      antecedents: (facts.imported?.antecedents ?? [])
        .slice(0, LIST_MAX)
        .map((item) => clip(item, 120)),
      openAlerts: record.alerts
        .filter((alert) => alert.status !== "resolved")
        .map((alert) => ({ level: alert.level, status: alert.status })),
      recentExchanges: exchanges,
    },
  };
}

/** Titre d'une conversation : le début du premier message, sur une ligne. */
export function conversationTitle(message: string): string {
  return clip(message.replace(/\s+/g, " "), 80);
}
