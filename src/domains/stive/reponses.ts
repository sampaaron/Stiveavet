import { z } from "zod";

import { synthesisContent } from "@/domains/suivis/synthese-garde";

/**
 * Réponses de Stive, gardées en base sous forme de données (ADR 0034) et mises en mots à
 * l'affichage, dans la langue de la personne. Validées à l'écriture comme à la lecture : une
 * réponse illisible n'est jamais affichée.
 * Chaque donnée d'un dossier y garde l'identifiant du suivi : si la personne perd l'accès au
 * dossier (dossier rendu privé, partage retiré), elle disparaît de l'historique.
 */

const id = z.uuid();
const name = z.string().min(1).max(160);
const instant = z.iso.datetime();
const count = z.int().min(0).max(100_000);

const STATUS_CHANGES = ["pause", "resume", "stop"] as const;
const change = z.enum(STATUS_CHANGES);
const followupStatus = z.enum([
  "draft",
  "active",
  "paused",
  "human_takeover",
  "ended",
]);
const appointmentKind = z.enum([
  "post_op_control",
  "emergency",
  "treatment_followup",
  "other",
]);

const followupRef = z.object({ id, animalName: name });

const priorityLine = followupRef.extend({
  procedure: name,
  dayNumber: count,
  responsibleName: name,
});

const agendaLine = z.object({
  startsAt: instant,
  endsAt: instant,
  vetName: name,
  title: z.union([
    z.object({ appointment: appointmentKind, animalName: name }),
    z.object({ text: name }),
  ]),
  pending: z.boolean(),
});

/** Jour de Paris, « AAAA-MM-JJ ». */
const day = z.iso.date();

export const stiveAnswer = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("briefing"),
    /** Suivis prioritaires : seulement avec l'accès clinique. */
    urgent: z.array(priorityLine).max(30),
    watch: z.array(priorityLine).max(30),
    /** null : sans accès clinique. */
    unacknowledged: count.nullable(),
    /** null : sans droit de lecture de l'agenda. */
    agenda: z.array(agendaLine).max(60).nullable(),
    pendingAppointments: count.nullable(),
    /** Fiches de lancement à finir. */
    drafts: z.array(followupRef.extend({ responsibleName: name })).max(30),
    active: count,
  }),
  z.object({
    kind: z.literal("summary"),
    followup: followupRef.extend({
      procedure: name,
      dayNumber: count,
      status: followupStatus,
    }),
    /** null : suivi pas encore lancé. */
    synthesis: synthesisContent.nullable(),
    exchanges: z.object({
      ownerMessages: count,
      photos: count,
      voiceNotes: count,
    }),
    openAlerts: count,
  }),
  z.object({
    kind: z.literal("slots"),
    period: z.object({
      label: z.enum([
        "today",
        "tomorrow",
        "day",
        "this_week",
        "next_week",
        "next_days",
      ]),
      from: day,
      /** Dernier jour compris. */
      until: day,
    }),
    /** null : tous les vétérinaires. */
    vetName: name.nullable(),
    slots: z
      .array(z.object({ startsAt: instant, endsAt: instant, vetName: name }))
      .max(60),
  }),
  z.object({
    kind: z.literal("appointments"),
    items: z
      .array(
        z.object({
          /** null : la personne ne peut pas confirmer ; la carte est en lecture. */
          proposalId: id.nullable(),
          followupId: id,
          animalName: name,
          vetName: name,
          appointmentKind,
          startsAt: instant,
          endsAt: instant,
        }),
      )
      .max(30),
    callbacks: count,
  }),
  z.object({
    kind: z.literal("draft"),
    followup: followupRef,
    proposalId: id,
    recipients: z.array(name).min(1).max(4),
  }),
  z.object({
    kind: z.literal("status"),
    followup: followupRef,
    proposalId: id,
    change,
  }),
  z.object({
    kind: z.literal("choose"),
    purpose: z.enum(["summary", "draft", "status"]),
    change: change.nullable(),
    candidates: z
      .array(followupRef.extend({ ownerName: name.nullable() }))
      .max(8),
  }),
  z.object({
    kind: z.literal("unavailable"),
    reason: z.enum([
      "not_clinical",
      "no_agenda",
      "cannot_write",
      "cannot_steer",
      "no_consent",
      "test_followup",
      "same_status",
      "not_launched",
    ]),
    animalName: name.nullable(),
    change: change.nullable(),
  }),
  z.object({ kind: z.literal("unknown") }),
  z.object({
    kind: z.literal("limit"),
    limit: count,
    /** Premier jour du mois suivant (Paris). */
    resetsOn: day,
    /** Une formule supérieure existe. */
    upgrade: z.boolean(),
  }),
]);

export type StiveAnswer = z.infer<typeof stiveAnswer>;
export type StiveAnswerKind = StiveAnswer["kind"];

/**
 * Suivis cités par une réponse et accès requis pour les montrer : le détail clinique d'un
 * dossier exige l'accès clinique ; un nom d'animal (rendez-vous, fiche à finir), l'accès
 * d'organisation.
 */
export function followupsOf(
  answer: StiveAnswer,
): { id: string; access: "summary" | "clinical" }[] {
  switch (answer.kind) {
    case "briefing":
      return [
        ...[...answer.urgent, ...answer.watch].map((line) => ({
          id: line.id,
          access: "clinical" as const,
        })),
        ...answer.drafts.map((line) => ({
          id: line.id,
          access: "summary" as const,
        })),
      ];
    case "summary":
    case "draft":
    case "status":
      return [{ id: answer.followup.id, access: "clinical" }];
    case "appointments":
      return answer.items.map((item) => ({
        id: item.followupId,
        access: "summary",
      }));
    case "choose":
      return answer.candidates.map((candidate) => ({
        id: candidate.id,
        access: "clinical",
      }));
    default:
      return [];
  }
}

type Access = "none" | "summary" | "clinical";

const allowed = (have: Access | undefined, need: "summary" | "clinical") =>
  have === "clinical" || (need === "summary" && have === "summary");

/**
 * Réponse telle qu'on peut encore la montrer à la personne, selon ses accès actuels : les
 * lignes d'un dossier devenu inaccessible sont retirées ; une réponse qui ne parle que d'un tel
 * dossier est masquée entièrement (null).
 */
export function visibleAnswer(
  answer: StiveAnswer,
  access: ReadonlyMap<string, Access>,
): StiveAnswer | null {
  const can = (id: string, need: "summary" | "clinical") =>
    allowed(access.get(id), need);
  switch (answer.kind) {
    case "briefing":
      return {
        ...answer,
        urgent: answer.urgent.filter((line) => can(line.id, "clinical")),
        watch: answer.watch.filter((line) => can(line.id, "clinical")),
        drafts: answer.drafts.filter((line) => can(line.id, "summary")),
      };
    case "summary":
    case "draft":
    case "status":
      return can(answer.followup.id, "clinical") ? answer : null;
    case "appointments":
      return {
        ...answer,
        items: answer.items.filter((item) => can(item.followupId, "summary")),
      };
    case "choose":
      return {
        ...answer,
        candidates: answer.candidates.filter((c) => can(c.id, "clinical")),
      };
    default:
      return answer;
  }
}
