import { z } from "zod";

import type { SynthesisDraft } from "@/adapters/ai-gateway/types";
import { checkNumaReply } from "@/domains/conversations/guard";
import type { GuardReason } from "@/domains/conversations/guard";

/**
 * Garde-fous de la synthèse pré-consultation (ADR 0020), appliqués à toute rédaction de la
 * passerelle IA, quel que soit le prestataire : une citation du propriétaire doit reprendre
 * ses mots exacts ; hors citations, ni diagnostic, ni dosage, ni prescription, ni réassurance.
 */

const MAX_LINE = 1200;

export const synthesisContent = z.object({
  evolution: z.string().min(1).max(MAX_LINE),
  positives: z.array(z.string().min(1).max(MAX_LINE)).max(10),
  negatives: z.array(z.string().min(1).max(MAX_LINE)).max(10),
  openQuestions: z.array(z.string().min(1).max(MAX_LINE)).max(10),
  /** Lignes écartées par les garde-fous : le vétérinaire est invité à lire la conversation. */
  withheld: z.int().min(0).max(40),
});
export type SynthesisContent = z.infer<typeof synthesisContent>;

export type SynthesisGuardReason = GuardReason | "unfaithful_quote";
export type SynthesisGuardVerdict =
  { ok: true } | { ok: false; reason: SynthesisGuardReason };

const QUOTE = /«\s?([^»]*?)\s?»|“([^”]*)”/g;

function squash(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Garde-fou d'une ligne de synthèse. `sources` : les textes des échanges transmis. Toute
 * citation doit en reprendre un passage exact ; hors citations, mêmes règles que Numa.
 */
export function checkSynthesisLine(
  line: string,
  sources: readonly string[],
): SynthesisGuardVerdict {
  if (!line.trim() || line.length > MAX_LINE)
    return { ok: false, reason: "length" };
  const corpus = sources.map(squash);
  for (const match of line.matchAll(QUOTE)) {
    const quoted = squash(match[1] ?? match[2] ?? "");
    if (!quoted || !corpus.some((source) => source.includes(quoted)))
      return { ok: false, reason: "unfaithful_quote" };
  }
  const outside = squash(line.replace(QUOTE, " "));
  if (!outside) return { ok: true };
  return checkNumaReply(outside);
}

const FALLBACK_EVOLUTION = {
  fr: "Synthèse indisponible pour cette partie : lisez la conversation.",
  en: "Summary unavailable for this part: please read the conversation.",
} as const;

/** Applique les garde-fous à la rédaction : chaque ligne refusée est écartée et comptée. */
export function guardDraft(
  draft: SynthesisDraft,
  sources: readonly string[],
  language: "fr" | "en",
): { content: SynthesisContent; reasons: SynthesisGuardReason[] } {
  const reasons: SynthesisGuardReason[] = [];
  const keep = (lines: readonly string[]) =>
    lines.slice(0, 10).filter((line) => {
      const verdict = checkSynthesisLine(line, sources);
      if (!verdict.ok) reasons.push(verdict.reason);
      return verdict.ok;
    });
  const evolutionVerdict = checkSynthesisLine(draft.evolution, sources);
  if (!evolutionVerdict.ok) reasons.push(evolutionVerdict.reason);
  const positives = keep(draft.positives);
  const negatives = keep(draft.negatives);
  const openQuestions = keep(draft.openQuestions);
  return {
    content: {
      evolution: evolutionVerdict.ok
        ? draft.evolution
        : FALLBACK_EVOLUTION[language],
      positives,
      negatives,
      openQuestions,
      withheld: reasons.length,
    },
    reasons,
  };
}
