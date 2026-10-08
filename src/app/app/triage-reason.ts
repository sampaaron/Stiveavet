import type { TriageReason } from "@/domains/urgences/reason";
import type { AppDictionary } from "@/i18n/app/types";

/**
 * Motif d'un triage dans la langue du lecteur (ADR 0022) : un motif automatique par son code
 * (le signe d'alerte cité reste tel que le vétérinaire l'a écrit), un motif écrit par un
 * vétérinaire tel quel.
 */
export function triageReasonText(
  t: AppDictionary,
  reason: TriageReason,
): string {
  const labels = t.labels.triageReasons;
  switch (reason.code) {
    case null:
      return reason.text;
    case "rule":
      return reason.rule ? labels.rule(reason.rule) : reason.text;
    default:
      return labels[reason.code];
  }
}
