import { z } from "zod";

import type { StiveToolDefinition } from "@/adapters/ai-gateway/types";
import { foldText } from "@/domains/commun/utilitaires";
import type { FollowupView } from "@/domains/suivis/service";

import type { DraftTemplate, SlotPeriod, StatusChange } from "./demandes";
import { isoWeekday } from "./demandes";
import type { StiveAnswer } from "./reponses";

/**
 * Outils de Stive conversationnel (ADR 0042) : leur description pour le modèle, la relecture
 * de leurs arguments (Zod) et la réduction de leurs résultats au strict nécessaire.
 * - Les six demandes de l'ADR 0034 deviennent des outils, plus deux outils de lecture.
 * - Le serveur les exécute avec les droits de la personne, par les mêmes fonctions que les
 *   demandes reconnues par règles (`service.ts`) : Stive n'a aucun chemin d'écriture.
 * - Un suivi est désigné par une référence courte (« S1 »), propre au tour : ni identifiant
 *   interne, ni nom de propriétaire ne partent chez le prestataire.
 * - Les propos de propriétaires sont des données non fiables : regroupés sous
 *   `synthese_non_fiable`, sans adresse, numéro ni nom du propriétaire.
 */

export const TOOL_NAMES = [
  "point_du_jour",
  "chercher_suivis",
  "lire_dossier",
  "creneaux_libres",
  "rendez_vous_demandes",
  "preparer_brouillon",
  "proposer_changement_suivi",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

const SUIVI = {
  type: "string",
  description:
    "Référence du suivi (« S1 », « S2 »…), donnée par chercher_suivis ou par le contexte.",
};
const ANIMAL = {
  type: "string",
  description: "Prénom de l'animal, si la référence n'est pas connue.",
};
const PERIODS = [
  "aujourd_hui",
  "demain",
  "jour",
  "cette_semaine",
  "semaine_prochaine",
  "sept_jours",
] as const;

function object(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return {
    type: "object",
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: false,
  };
}

export const STIVE_TOOLS: readonly StiveToolDefinition[] = [
  {
    name: "point_du_jour",
    description:
      "Point du jour de la personne : suivis urgents ou à surveiller, alertes sans accusé de réception, agenda du jour, rendez-vous à confirmer, fiches à finir. Affiche une carte.",
    parameters: object({}),
  },
  {
    name: "chercher_suivis",
    description:
      "Liste les suivis que la personne a le droit de voir, avec leur référence, l'espèce, l'intervention, le jour (J+n) et le niveau de triage. Filtre facultatif sur le prénom de l'animal.",
    parameters: object({
      animal: ANIMAL,
      en_cours_seulement: {
        type: "boolean",
        description: "true : seulement les suivis en cours (par défaut).",
      },
    }),
  },
  {
    name: "lire_dossier",
    description:
      "Résumé d'un dossier de suivi : intervention, J+n, état, triage, alertes, synthèse des échanges avec le propriétaire. Consultation tracée au journal. Affiche une carte.",
    parameters: object({ suivi: SUIVI, animal: ANIMAL }),
  },
  {
    name: "creneaux_libres",
    description:
      "Créneaux libres de l'agenda (lus sur les captures d'agenda), pour un vétérinaire ou toute l'équipe. Affiche une carte.",
    parameters: object(
      {
        periode: { type: "string", enum: [...PERIODS] },
        jour: {
          type: "string",
          description: "Date AAAA-MM-JJ, seulement pour periode = jour.",
        },
        veterinaire: {
          type: "string",
          description:
            "Prénom ou nom d'un vétérinaire de l'équipe, « moi » ou « équipe ».",
        },
      },
      ["periode"],
    ),
  },
  {
    name: "rendez_vous_demandes",
    description:
      "Rendez-vous demandés par les propriétaires et proposés par Numa, à confirmer ou refuser. Affiche une carte avec des boutons que la personne clique elle-même.",
    parameters: object({}),
  },
  {
    name: "preparer_brouillon",
    description:
      "Prépare un brouillon de message au propriétaire (modèle fixe, non médical) : prendre des nouvelles, demander une photo, ou proposer un appel. Rien n'est envoyé : la personne relit et clique elle-même sur Envoyer dans le dossier. Affiche une carte.",
    parameters: object(
      {
        suivi: SUIVI,
        animal: ANIMAL,
        modele: { type: "string", enum: ["nouvelles", "photo", "appel"] },
      },
      ["modele"],
    ),
  },
  {
    name: "proposer_changement_suivi",
    description:
      "Propose de mettre en pause, reprendre ou arrêter un suivi. Rien ne change avant que la personne clique sur Confirmer dans la carte affichée.",
    parameters: object(
      {
        suivi: SUIVI,
        animal: ANIMAL,
        changement: { type: "string", enum: ["pause", "reprise", "arret"] },
      },
      ["changement"],
    ),
  },
];

// Arguments --------------------------------------------------------------------------------

const ref = z
  .string()
  .trim()
  .regex(/^[sS]\d{1,3}$/)
  .transform((value) => value.toUpperCase());
const animal = z.string().trim().min(1).max(60);
const target = { suivi: ref.optional(), animal: animal.optional() };

const TEMPLATES: Record<"nouvelles" | "photo" | "appel", DraftTemplate> = {
  nouvelles: "news",
  photo: "photo",
  appel: "call",
};
const CHANGES: Record<"pause" | "reprise" | "arret", StatusChange> = {
  pause: "pause",
  reprise: "resume",
  arret: "stop",
};

export const toolArguments = {
  point_du_jour: z.object({}),
  chercher_suivis: z.object({
    animal: animal.optional(),
    en_cours_seulement: z.boolean().optional(),
  }),
  lire_dossier: z.object(target),
  creneaux_libres: z.object({
    periode: z.enum(PERIODS),
    jour: z.iso.date().optional(),
    veterinaire: z.string().trim().min(1).max(80).optional(),
  }),
  rendez_vous_demandes: z.object({}),
  preparer_brouillon: z.object({
    ...target,
    modele: z
      .enum(["nouvelles", "photo", "appel"])
      .transform((m) => TEMPLATES[m]),
  }),
  proposer_changement_suivi: z.object({
    ...target,
    changement: z
      .enum(["pause", "reprise", "arret"])
      .transform((c) => CHANGES[c]),
  }),
} satisfies Record<ToolName, z.ZodType>;

export type ToolArguments = {
  [Name in ToolName]: z.infer<(typeof toolArguments)[Name]>;
};

export type ParsedToolCall = {
  [Name in ToolName]: { name: Name; args: ToolArguments[Name] };
}[ToolName];

const isToolName = (name: string): name is ToolName =>
  (TOOL_NAMES as readonly string[]).includes(name);

/** Appel relu : outil connu et arguments valides, sinon null (le modèle en est informé). */
export function parseToolCall(call: {
  name: string;
  arguments: string;
}): ParsedToolCall | null {
  if (!isToolName(call.name)) return null;
  let raw: unknown;
  try {
    raw = call.arguments.trim() ? JSON.parse(call.arguments) : {};
  } catch {
    return null;
  }
  const parsed = toolArguments[call.name].safeParse(raw ?? {});
  if (!parsed.success) return null;
  return { name: call.name, args: parsed.data } as ParsedToolCall;
}

const DAY_MS = 86_400_000;
const SLOT_HORIZON_DAYS = 31;

/** Période demandée par l'outil, en jours de Paris ; null : date hors de portée. */
export function slotPeriod(
  args: ToolArguments["creneaux_libres"],
  today: number,
): SlotPeriod | null {
  const weekday = isoWeekday(today);
  switch (args.periode) {
    case "aujourd_hui":
      return { label: "today", from: today, to: today + 1 };
    case "demain":
      return { label: "tomorrow", from: today + 1, to: today + 2 };
    case "cette_semaine":
      return { label: "this_week", from: today, to: today + (8 - weekday) };
    case "semaine_prochaine": {
      const monday = today + (8 - weekday);
      return { label: "next_week", from: monday, to: monday + 7 };
    }
    case "jour": {
      if (!args.jour) return null;
      const day = Math.floor(Date.parse(`${args.jour}T00:00:00Z`) / DAY_MS);
      if (
        !Number.isFinite(day) ||
        day < today ||
        day > today + SLOT_HORIZON_DAYS
      )
        return null;
      return { label: "day", from: day, to: day + 1 };
    }
    default:
      return { label: "next_days", from: today, to: today + 7 };
  }
}

// Références des suivis ----------------------------------------------------------------------

/** Références courtes des suivis visibles par la personne, propres au tour. */
export type FollowupRefs = {
  idOf: (reference: string) => string | undefined;
  refOf: (id: string) => string | undefined;
};

export function followupRefs(views: readonly FollowupView[]): FollowupRefs {
  const byRef = new Map<string, string>();
  const byId = new Map<string, string>();
  views.forEach((view, index) => {
    const reference = `S${index + 1}`;
    byRef.set(reference, view.id);
    byId.set(view.id, reference);
  });
  return {
    idOf: (reference) => byRef.get(reference.toUpperCase()),
    refOf: (id) => byId.get(id),
  };
}

// Réduction des résultats --------------------------------------------------------------------

const SPECIES = { dog: "chien", cat: "chat" } as const;
const STATUS = {
  draft: "fiche de lancement à finir",
  active: "en cours",
  paused: "en pause",
  human_takeover: "repris en main par l'équipe",
  ended: "terminé",
} as const;
const TRIAGE = {
  normal: "normal",
  watch: "à surveiller",
  urgent: "urgent",
} as const;
const APPOINTMENT_KINDS = {
  post_op_control: "contrôle post-opératoire",
  emergency: "urgence",
  treatment_followup: "suivi de traitement",
  other: "autre",
} as const;
const CHANGE_WORDS = { pause: "pause", resume: "reprise", stop: "arrêt" };

const REFUSALS: Record<
  Extract<StiveAnswer, { kind: "unavailable" }>["reason"],
  string
> = {
  not_clinical:
    "Dossier introuvable, ou hors de l'accès clinique de la personne : n'en dis rien de plus.",
  no_agenda: "La personne n'a pas accès à l'agenda.",
  cannot_write: "La personne ne peut pas écrire aux propriétaires.",
  cannot_steer:
    "Seul un vétérinaire qui suit cet animal peut changer l'état du suivi.",
  no_consent:
    "Le propriétaire n'a pas encore donné son accord : on ne peut pas encore lui écrire.",
  test_followup: "C'est un suivi de test : aucun message ne part.",
  same_status: "Le suivi est déjà dans cet état ou ne peut pas y passer.",
  not_launched:
    "Le suivi n'est pas encore lancé : sa fiche de lancement est à finir.",
};

const parisTime = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
});
const parisDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const when = (iso: string) => {
  const at = new Date(iso);
  return `${parisDate.format(at)} ${parisTime.format(at)}`;
};

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+/gu;
const NUMBER = /\+?\d(?:[\s.\-/]?\d){5,}/g;
const MAX_EXCERPT = 600;

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Propos d'un propriétaire (ou texte qui les cite), avant envoi au prestataire : ni adresse,
 * ni numéro, ni nom du propriétaire ; caractères de contrôle retirés, longueur bornée.
 */
export function untrustedExcerpt(
  text: string,
  ownerNames: readonly string[],
): string {
  let excerpt = text.replace(/[\u0000-\u001f\u007f]+/g, " ");
  excerpt = excerpt.replace(EMAIL, "[masqué]").replace(NUMBER, "[masqué]");
  const words = new Set(
    ownerNames
      .flatMap((name) => name.split(/[\s'’-]+/))
      .map((word) => word.trim())
      .filter((word) => word.length >= 3),
  );
  for (const word of words)
    excerpt = excerpt.replace(
      new RegExp(`(^|[^\\p{L}])${escape(word)}(?=$|[^\\p{L}])`, "giu"),
      "$1[propriétaire]",
    );
  return excerpt.slice(0, MAX_EXCERPT);
}

/** Ligne d'un suivi pour le modèle : jamais le propriétaire. */
export function followupLine(
  view: FollowupView,
  refs: FollowupRefs,
  now: Date,
) {
  const base = {
    ref: refs.refOf(view.id) ?? null,
    animal: view.animalName,
    espece: SPECIES[view.species],
    statut: STATUS[view.status],
  };
  if (view.access !== "clinical")
    return { ...base, acces: "organisation seulement" };
  return {
    ...base,
    intervention: view.procedure,
    jour: `J+${Math.max(0, Math.floor((now.getTime() - view.procedureAt.getTime()) / DAY_MS))}`,
    triage: TRIAGE[view.triage],
  };
}

const MAX_LISTED = 25;
const ONGOING = new Set(["active", "paused", "human_takeover"]);

/** Résultat de `chercher_suivis`. */
export function searchResult(
  views: readonly FollowupView[],
  args: ToolArguments["chercher_suivis"],
  refs: FollowupRefs,
  now: Date,
) {
  const wanted = args.animal ? foldText(args.animal) : null;
  const ongoingOnly = args.en_cours_seulement ?? !wanted;
  const found = views.filter(
    (view) =>
      (!ongoingOnly || ONGOING.has(view.status)) &&
      (!wanted || foldText(view.animalName).includes(wanted)),
  );
  return {
    total: found.length,
    suivis: found
      .slice(0, MAX_LISTED)
      .map((view) => followupLine(view, refs, now)),
    ...(found.length > MAX_LISTED ? { tronque: true } : {}),
  };
}

/**
 * Résultat d'un outil qui a produit une réponse de l'ADR 0034, réduit pour le modèle.
 * `views` : suivis visibles, pour les références et les noms de propriétaires à masquer.
 */
export function toolResult(
  answer: StiveAnswer,
  refs: FollowupRefs,
  views: readonly FollowupView[],
) {
  const ownerNamesOf = (id: string) => {
    const owner = views.find((view) => view.id === id)?.ownerName;
    return owner ? [owner] : [];
  };
  switch (answer.kind) {
    case "briefing": {
      const line = (item: (typeof answer.urgent)[number]) => ({
        ref: refs.refOf(item.id) ?? null,
        animal: item.animalName,
        intervention: item.procedure,
        jour: `J+${item.dayNumber}`,
      });
      return {
        carte_affichee: true,
        suivis_en_cours: answer.active,
        urgents: answer.urgent.map(line),
        a_surveiller: answer.watch.map(line),
        alertes_sans_accuse: answer.unacknowledged ?? "non accessible",
        agenda_du_jour:
          answer.agenda?.map((item) => ({
            heure: parisTime.format(new Date(item.startsAt)),
            veterinaire: item.vetName,
            // Un intitulé libre de l'agenda peut contenir un nom : il ne part jamais.
            objet:
              "appointment" in item.title
                ? `${APPOINTMENT_KINDS[item.title.appointment]} · ${item.title.animalName}`
                : "créneau occupé",
            a_confirmer: item.pending,
          })) ?? "non accessible",
        rendez_vous_a_confirmer: answer.pendingAppointments ?? "non accessible",
        fiches_a_finir: answer.drafts.length,
      };
    }
    case "summary": {
      const owners = ownerNamesOf(answer.followup.id);
      const view = views.find((entry) => entry.id === answer.followup.id);
      const clean = (text: string) => untrustedExcerpt(text, owners);
      return {
        carte_affichee: true,
        ref: refs.refOf(answer.followup.id) ?? null,
        animal: answer.followup.animalName,
        espece: view ? SPECIES[view.species] : null,
        intervention: answer.followup.procedure,
        jour: `J+${answer.followup.dayNumber}`,
        statut: STATUS[answer.followup.status],
        triage: view?.access === "clinical" ? TRIAGE[view.triage] : null,
        alertes_en_cours: answer.openAlerts,
        echanges: {
          messages_du_proprietaire: answer.exchanges.ownerMessages,
          photos: answer.exchanges.photos,
          vocaux: answer.exchanges.voiceNotes,
        },
        synthese_non_fiable: answer.synthesis
          ? {
              evolution: clean(answer.synthesis.evolution),
              signaux_rassurants: answer.synthesis.positives.map(clean),
              signaux_preoccupants: answer.synthesis.negatives.map(clean),
              questions_ouvertes: answer.synthesis.openQuestions.map(clean),
            }
          : "suivi pas encore lancé : rien à résumer",
      };
    }
    case "slots":
      return {
        carte_affichee: true,
        du: answer.period.from,
        au: answer.period.until,
        veterinaire: answer.vetName ?? "toute l'équipe",
        total: answer.slots.length,
        creneaux: answer.slots.slice(0, 20).map((slot) => ({
          debut: when(slot.startsAt),
          fin: parisTime.format(new Date(slot.endsAt)),
          veterinaire: slot.vetName,
        })),
      };
    case "appointments":
      return {
        carte_affichee: true,
        a_confirmer: answer.items.map((item) => ({
          ref: refs.refOf(item.followupId) ?? null,
          animal: item.animalName,
          type: APPOINTMENT_KINDS[item.appointmentKind],
          debut: when(item.startsAt),
          veterinaire: item.vetName,
          la_personne_peut_confirmer: item.proposalId !== null,
        })),
        proprietaires_attendant_un_rappel: answer.callbacks,
      };
    case "draft":
      return {
        carte_affichee: true,
        brouillon_prepare: true,
        animal: answer.followup.animalName,
        envoi:
          "Rien n'est envoyé : la personne relit le brouillon dans le dossier et clique elle-même sur Envoyer.",
      };
    case "status":
      return {
        carte_affichee: true,
        a_confirmer: true,
        animal: answer.followup.animalName,
        changement: CHANGE_WORDS[answer.change],
        effet: "Rien ne change avant le clic de la personne sur Confirmer.",
      };
    case "choose":
      return {
        carte_affichee: false,
        precision_requise:
          "Plusieurs suivis possibles, ou aucun nommé : demande lequel à la personne.",
        candidats: answer.candidates.map((candidate) => {
          const view = views.find((entry) => entry.id === candidate.id);
          return {
            ref: refs.refOf(candidate.id) ?? null,
            animal: candidate.animalName,
            espece: view ? SPECIES[view.species] : null,
            statut: view ? STATUS[view.status] : null,
          };
        }),
      };
    case "unavailable":
      return {
        carte_affichee: false,
        refus: REFUSALS[answer.reason],
        ...(answer.animalName ? { animal: answer.animalName } : {}),
      };
    default:
      return { carte_affichee: false };
  }
}

/**
 * Une réponse déjà affichée, décrite en une ligne pour l'historique envoyé au modèle : jamais
 * le détail d'une carte (il a pu changer), jamais un nom de propriétaire.
 */
export function describeAnswer(answer: StiveAnswer): string | null {
  switch (answer.kind) {
    case "reply":
      return answer.text ?? "[Réponse écartée par le contrôle de sécurité]";
    case "briefing":
      return "[Carte affichée : point du jour]";
    case "summary":
      return `[Carte affichée : résumé du dossier de ${answer.followup.animalName}]`;
    case "slots":
      return `[Carte affichée : créneaux libres du ${answer.period.from} au ${answer.period.until}]`;
    case "appointments":
      return "[Carte affichée : rendez-vous demandés à confirmer]";
    case "draft":
      return `[Carte affichée : brouillon de message pour le propriétaire de ${answer.followup.animalName}, non envoyé]`;
    case "status":
      return `[Carte à confirmer : ${CHANGE_WORDS[answer.change]} du suivi de ${answer.followup.animalName}]`;
    case "choose":
      return "[Stive a demandé de préciser le suivi]";
    case "unavailable":
      return `[Demande impossible : ${REFUSALS[answer.reason]}]`;
    case "limit":
      return "[Limite mensuelle de demandes atteinte]";
    case "smalltalk":
      return "[Réponse simple de Stive]";
    default:
      return "[Demande non traitée]";
  }
}
