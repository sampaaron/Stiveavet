import { slotChoice, wantsAppointment } from "@/domains/agenda/rendez-vous";

import type { SynthesisDraft, SynthesisEvent, SynthesisInput } from "./types";

/**
 * Synthèse pré-consultation simulée (lot 17) : règles écrites, sans hasard ni réseau. Elle ne
 * reformule jamais un propos du propriétaire : elle le cite, mot pour mot et entre
 * guillemets, et le range selon le triage déterministe déjà fait. Elle ne juge rien : ni
 * gravité, ni cause, ni conduite à tenir. Une vraie IA rédigera mieux, sous les mêmes
 * garde-fous (`domains/suivis/synthese.ts`).
 */

const MAX_SIGNALS = 5;
const MAX_QUESTIONS = 3;
const MAX_EXCERPT = 140;

const TEXT = {
  fr: {
    day: (n: number, procedure: string) => `Jour ${n} du suivi (${procedure}).`,
    none: "Pas encore de nouvelles du propriétaire.",
    count: (n: number) =>
      n === 1 ? "1 nouvelle du propriétaire" : `${n} nouvelles du propriétaire`,
    flagged: (k: number) =>
      k === 1
        ? ", dont 1 signalée à surveiller ou urgente"
        : `, dont ${k} signalées à surveiller ou urgentes`,
    latest: (at: string, quoted: string) =>
      `Dernière nouvelle (${at}) : ${quoted}.`,
    photo: " (photo)",
    voice: " (vocal)",
    photoOnly: "Photo envoyée sans commentaire",
    ownerQuestion: (quoted: string) => `Question du propriétaire : ${quoted}`,
    unanswered: (quoted: string) => `Sans réponse du propriétaire : ${quoted}`,
    quote: (text: string) => `« ${text} »`,
    locale: "fr-FR",
  },
  en: {
    day: (n: number, procedure: string) =>
      `Day ${n} of follow-up (${procedure}).`,
    none: "No news from the owner yet.",
    count: (n: number) =>
      n === 1 ? "1 update from the owner" : `${n} updates from the owner`,
    flagged: (k: number) =>
      k === 1
        ? ", 1 of them flagged to watch or urgent"
        : `, ${k} of them flagged to watch or urgent`,
    latest: (at: string, quoted: string) => `Latest update (${at}): ${quoted}.`,
    photo: " (photo)",
    voice: " (voice note)",
    photoOnly: "Photo sent without comment",
    ownerQuestion: (quoted: string) => `Owner's question: ${quoted}`,
    unanswered: (quoted: string) => `No answer from the owner yet: ${quoted}`,
    quote: (text: string) => `“${text}”`,
    locale: "en-GB",
  },
} as const;

/** Extrait fidèle : coupé à un espace, jamais au milieu d'un mot, sans rien changer d'autre. */
function excerpt(text: string): string {
  const clean = text.trim();
  if (clean.length <= MAX_EXCERPT) return clean;
  const cut = clean.slice(0, MAX_EXCERPT);
  const space = cut.lastIndexOf(" ");
  return cut.slice(0, space > 40 ? space : MAX_EXCERPT).trimEnd();
}

function line(
  event: SynthesisEvent,
  language: SynthesisInput["language"],
): string {
  const t = TEXT[language];
  const suffix =
    event.media === "photo" ? t.photo : event.media === "voice" ? t.voice : "";
  if (!event.text.trim()) return t.photoOnly;
  return `${t.quote(excerpt(event.text))}${suffix}`;
}

export function simulatedSynthesis(input: SynthesisInput): SynthesisDraft {
  const t = TEXT[input.language];
  const events = [...input.events].sort(
    (a, b) => a.at.getTime() - b.at.getTime(),
  );
  const owner = events.filter((event) => event.from === "owner");
  const said = owner.filter((event) => event.text.trim());
  const flagged = owner.filter(
    (event) => event.triage === "watch" || event.triage === "urgent",
  );

  const parts: string[] = [t.day(input.dayNumber, input.procedure)];
  const latest = owner.at(-1);
  if (!latest) parts.push(t.none);
  else {
    parts.push(
      `${t.count(owner.length)}${flagged.length ? t.flagged(flagged.length) : ""}.`,
    );
    const at = new Intl.DateTimeFormat(t.locale, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Paris",
    }).format(latest.at);
    parts.push(t.latest(at, line(latest, input.language)));
  }

  // Demande de rendez-vous ou choix d'un créneau (lot 18) : ni un signal, ni une question
  // ouverte ; l'agenda les suit.
  const logistics = (event: SynthesisEvent) =>
    slotChoice(event.text) !== null || wantsAppointment(event.text);
  const positives = said
    .filter((event) => event.triage === "normal" && !logistics(event))
    .slice(-MAX_SIGNALS)
    .map((event) => line(event, input.language));
  const negatives = flagged
    .slice(-MAX_SIGNALS)
    .map((event) => line(event, input.language));

  // Questions du propriétaire, et dernière question de Numa restée sans réponse.
  const openQuestions = said
    .filter((event) => event.text.includes("?") && !logistics(event))
    .slice(-MAX_QUESTIONS)
    .map((event) => t.ownerQuestion(t.quote(excerpt(event.text))));
  const lastQuestion = events.findLast(
    (event) => event.from !== "owner" && event.text.includes("?"),
  );
  if (
    lastQuestion &&
    !owner.some((event) => event.at.getTime() > lastQuestion.at.getTime())
  )
    openQuestions.push(t.unanswered(t.quote(excerpt(lastQuestion.text))));

  return { evolution: parts.join(" "), positives, negatives, openQuestions };
}
