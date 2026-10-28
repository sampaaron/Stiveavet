import type { SynthesisAlert, SynthesisView } from "@/domains/suivis/synthese";
import type { AppDictionary } from "@/i18n/app/types";
import type { Locale } from "@/i18n/locales";
import { formatDateTime, shortPersonName } from "@/ui/format";

import { triageReasonText } from "./triage-reason";

function alertState(t: AppDictionary, alert: SynthesisAlert): string {
  const states = t.dossier.synthesis.alertState;
  switch (alert.status) {
    case "acknowledged":
      return states.acknowledged(
        alert.acknowledgedBy
          ? shortPersonName(alert.acknowledgedBy)
          : states.aVet,
      );
    default:
      return states[alert.status];
  }
}

/** Une alerte de la synthèse, en une ligne. */
export function alertLine(
  t: AppDictionary,
  locale: Locale,
  alert: SynthesisAlert,
): string {
  return [
    t.labels.triage[alert.level],
    triageReasonText(t, alert.reason),
    formatDateTime(alert.createdAt, locale),
    alertState(t, alert),
  ].join(" · ");
}

/**
 * Texte brut de la synthèse, à coller dans le dossier dr.veto (ADR 0048). Il dit qu'il a été
 * préparé par une IA à relire ; Stivea Vet n'écrit jamais lui-même dans dr.veto.
 */
export function synthesisCopyText(
  t: AppDictionary,
  locale: Locale,
  synthesis: SynthesisView,
  about: { animalName: string; procedure: string; day: number },
): string {
  const text = t.dossier.synthesis;
  const section = (title: string, items: readonly string[]) =>
    items.length ? [`${title} :`, ...items.map((item) => `- ${item}`)] : [];
  return [
    text.copy.heading(about.animalName, about.procedure, about.day),
    text.exchanges(
      synthesis.exchanges.ownerMessages,
      synthesis.exchanges.photos,
      synthesis.exchanges.voiceNotes,
    ),
    synthesis.evolution,
    ...section(text.positives, synthesis.positives),
    ...section(text.negatives, synthesis.negatives),
    ...section(
      text.alerts,
      synthesis.alerts.map((alert) => alertLine(t, locale, alert)),
    ),
    ...section(text.openQuestions, synthesis.openQuestions),
    synthesis.withheld > 0 ? text.withheld(synthesis.withheld) : null,
    text.copy.footer(formatDateTime(synthesis.generatedAt, locale)),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
