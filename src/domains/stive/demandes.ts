import { foldText } from "@/domains/commun/utilitaires";

/**
 * Reconnaissance des demandes faites à Stive, en version simulée (ADR 0034) : des règles
 * écrites, en français et en anglais, sans appel à une IA. Pure : la liste des suivis visibles,
 * des vétérinaires et le jour de Paris sont fournis par l'appelant.
 * Six demandes seulement ; tout le reste reçoit « Je ne sais pas encore faire ça ».
 */

export type StatusChange = "pause" | "resume" | "stop";
export type DraftTemplate = "news" | "photo" | "call";

/** Période des créneaux libres : jours de Paris, `to` exclu. */
export type SlotPeriod = {
  label: "today" | "tomorrow" | "day" | "this_week" | "next_week" | "next_days";
  from: number;
  to: number;
};

/** Suivi visé : un seul, plusieurs à départager, ou aucun nommé. */
export type Target =
  | { kind: "one"; followupId: string }
  | { kind: "many"; followupIds: string[] }
  | { kind: "none" };

export type VetChoice =
  { kind: "self" } | { kind: "all" } | { kind: "vet"; membershipId: string };

export type StiveRequest =
  | { kind: "briefing" }
  | { kind: "summary"; target: Target }
  | { kind: "slots"; period: SlotPeriod; vet: VetChoice }
  | { kind: "appointments" }
  | { kind: "draft"; target: Target; template: DraftTemplate }
  | { kind: "status"; target: Target; change: StatusChange }
  | { kind: "unknown" };

export type KnownFollowup = {
  id: string;
  animalName: string;
  status: "draft" | "active" | "paused" | "human_takeover" | "ended";
};

export type KnownVet = { membershipId: string; name: string };

export type RecognitionContext = {
  followups: readonly KnownFollowup[];
  vets: readonly KnownVet[];
  /** La personne est vétérinaire : « mes créneaux » par défaut. */
  isVet: boolean;
  /** Suivi d'où la demande est faite (« Demander à Stive » dans un dossier). */
  followupId?: string;
  /** Jour de Paris de la demande. */
  today: number;
};

const DRAFT =
  /\bbrouillon|\bredig|\becri[rst]?\b|\becrire\b|\bprepare[rz]? (un |le )?message|\bmessage (a|au|aux|pour)\b|\bdraft|\bwrite\b/;
const PAUSE = /\bpause\b|\bsuspend/;
// « résumé » se replie en « resume » : la reprise anglaise exige donc « resume the follow-up ».
const RESUME =
  /\breprend|\breprise\b|\bresume (the |his |her )?follow|\bunpause/;
const STOP = /\barret|\bstop\b|\btermin|\bclotur|\bend\b|\bfinish/;
const APPOINTMENTS =
  /\brendez-vous\b|\brendez vous\b|\brdv\b|\bappointments?\b|\bbookings?\b/;
const REQUESTED =
  /\bdemand|\bconfirm|\battente\b|\bvalider\b|\brequest|\bpending\b|\bwaiting\b/;
const SLOTS =
  /\bcreneaux?\b|\bdisponib|\bdispos?\b|\blibres?\b|\bslots?\b|\bfree\b|\bavailab/;
const SUMMARY =
  /\bresum|\bsynthese|\bou en est|\bnouvelles de\b|\bdossier\b|\bsummar|\bhow is\b|\bupdate on\b|\bstatus of\b/;
const BRIEFING =
  /\bpoint\b|\bjournee\b|\baujourd'hui\b|\bbriefing\b|\btoday\b|\bmy day\b|\bpriorit|\bquoi de neuf\b|\bwhat's new\b|\bque dois-je\b/;

const PHOTO = /\bphoto|\bimage|\bpicture|\bpic\b/;
const CALL = /\bappel|\brappel|\btelephon|\bcall\b|\bphone\b|\bring\b/;

const SELF = /\bmes\b|\bmon\b|\bmoi\b|\bmy\b|\bmine\b|\bme\b/;
const EVERYONE =
  /\btous\b|\btoute l'equipe\b|\bl'equipe\b|\bcabinet\b|\bclinique\b|\beveryone\b|\ball vets\b|\bteam\b/;

const WEEKDAYS: readonly (readonly string[])[] = [
  ["lundi", "monday"],
  ["mardi", "tuesday"],
  ["mercredi", "wednesday"],
  ["jeudi", "thursday"],
  ["vendredi", "friday"],
  ["samedi", "saturday"],
  ["dimanche", "sunday"],
];

const ONGOING = new Set(["active", "paused", "human_takeover"]);

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Le mot (ou groupe de mots) apparaît-il entier dans le texte replié ? */
function hasWord(folded: string, word: string): boolean {
  const target = foldText(word).trim();
  if (target.length < 2) return false;
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${escape(target)}($|[^\\p{L}\\p{N}])`,
    "u",
  ).test(folded);
}

/** Jour ISO (1 = lundi) d'un jour de Paris. */
export function isoWeekday(day: number): number {
  return ((((day + 3) % 7) + 7) % 7) + 1;
}

function period(folded: string, today: number): SlotPeriod {
  if (/\bapres-demain\b|\bapres demain\b|\bday after tomorrow\b/.test(folded))
    return { label: "day", from: today + 2, to: today + 3 };
  if (/\bdemain\b|\btomorrow\b/.test(folded))
    return { label: "tomorrow", from: today + 1, to: today + 2 };
  if (
    /\baujourd'hui\b|\btoday\b|\bce (matin|soir)\b|\bcet apres-midi\b/.test(
      folded,
    )
  )
    return { label: "today", from: today, to: today + 1 };
  const weekday = isoWeekday(today);
  if (/\bsemaine prochaine\b|\bnext week\b/.test(folded)) {
    const monday = today + (8 - weekday);
    return { label: "next_week", from: monday, to: monday + 7 };
  }
  if (/\bcette semaine\b|\bthis week\b/.test(folded))
    return { label: "this_week", from: today, to: today + (8 - weekday) };
  for (const [index, names] of WEEKDAYS.entries())
    if (names.some((name) => hasWord(folded, name))) {
      const ahead = (index + 1 - weekday + 7) % 7;
      return { label: "day", from: today + ahead, to: today + ahead + 1 };
    }
  return { label: "next_days", from: today, to: today + 7 };
}

/** Prénom ou nom d'un vétérinaire, sans le titre (« Dr Claire Fontaine »). */
function vetWords(name: string): string[] {
  return foldText(name)
    .split(/\s+/)
    .filter((word) => word.length > 2 && word !== "dr" && word !== "dr.");
}

function vetChoice(folded: string, context: RecognitionContext): VetChoice {
  const named = context.vets.filter((vet) =>
    vetWords(vet.name).some((word) => hasWord(folded, word)),
  );
  if (named.length === 1 && named[0])
    return { kind: "vet", membershipId: named[0].membershipId };
  if (EVERYONE.test(folded)) return { kind: "all" };
  if (SELF.test(folded) || context.isVet)
    return context.isVet ? { kind: "self" } : { kind: "all" };
  return { kind: "all" };
}

/**
 * Suivi visé : animaux nommés dans la demande, sinon le dossier d'où elle vient. Entre deux
 * suivis du même nom, celui en cours l'emporte ; sinon la personne choisit.
 */
function target(folded: string, context: RecognitionContext): Target {
  const named = context.followups.filter((followup) =>
    hasWord(folded, followup.animalName),
  );
  if (named.length === 0)
    return context.followupId &&
      context.followups.some((f) => f.id === context.followupId)
      ? { kind: "one", followupId: context.followupId }
      : { kind: "none" };
  if (context.followupId && named.some((f) => f.id === context.followupId))
    return { kind: "one", followupId: context.followupId };
  if (named.length === 1 && named[0])
    return { kind: "one", followupId: named[0].id };
  const ongoing = named.filter((followup) => ONGOING.has(followup.status));
  if (ongoing.length === 1 && ongoing[0])
    return { kind: "one", followupId: ongoing[0].id };
  return {
    kind: "many",
    followupIds: (ongoing.length ? ongoing : named).map((f) => f.id),
  };
}

function statusChange(folded: string): StatusChange | null {
  if (PAUSE.test(folded)) return "pause";
  if (RESUME.test(folded)) return "resume";
  if (STOP.test(folded)) return "stop";
  return null;
}

/** Demande reconnue, de la plus précise à la plus générale. */
export function recognize(
  question: string,
  context: RecognitionContext,
): StiveRequest {
  const folded = foldText(question).replace(/\s+/g, " ").trim();
  if (DRAFT.test(folded))
    return {
      kind: "draft",
      target: target(folded, context),
      template: PHOTO.test(folded)
        ? "photo"
        : CALL.test(folded)
          ? "call"
          : "news",
    };
  const change = statusChange(folded);
  const aimed = target(folded, context);
  const named = context.followups.some((followup) =>
    hasWord(folded, followup.animalName),
  );
  if (change && aimed.kind !== "none")
    return { kind: "status", target: aimed, change };
  if (
    APPOINTMENTS.test(folded) &&
    (REQUESTED.test(folded) || !SLOTS.test(folded))
  )
    return { kind: "appointments" };
  if (SLOTS.test(folded))
    return {
      kind: "slots",
      period: period(folded, context.today),
      vet: vetChoice(folded, context),
    };
  if (change) return { kind: "status", target: aimed, change };
  if (SUMMARY.test(folded)) return { kind: "summary", target: aimed };
  if (BRIEFING.test(folded)) return { kind: "briefing" };
  // Un nom d'animal seul (« Moka ? ») : son résumé.
  if (named) return { kind: "summary", target: aimed };
  return { kind: "unknown" };
}
