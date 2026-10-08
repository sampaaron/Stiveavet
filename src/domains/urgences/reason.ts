import { eq } from "drizzle-orm";

import { followupAlertRules, triageEvents } from "@/server/db/schema";

import type { TriageReasonCode } from "./schema";

/**
 * Motif d'un triage tel que l'équipe le lit (ADR 0022). Un triage automatique porte un code,
 * affiché dans la langue du lecteur, et le signe d'alerte du suivi qu'il a reconnu ; un
 * triage écrit par un vétérinaire n'a que son texte. Contenu clinique : jamais journalisé.
 */
export type TriageReason = {
  code: TriageReasonCode | null;
  /** Texte d'origine, gardé tel quel (seul affiché pour un triage écrit par un vétérinaire). */
  text: string;
  /** Signe d'alerte de la fiche du suivi, tel que le vétérinaire l'a validé. */
  rule: string | null;
};

/** Colonnes à sélectionner, avec `joinTriageRule` sur la requête. */
export const triageReasonColumns = {
  reasonCode: triageEvents.reasonCode,
  reasonText: triageEvents.reason,
  reasonRule: followupAlertRules.description,
};

export const triageRuleJoin = eq(
  followupAlertRules.id,
  triageEvents.followupAlertRuleId,
);

export function triageReason(row: {
  reasonCode: TriageReasonCode | null;
  reasonText: string;
  reasonRule: string | null;
}): TriageReason {
  return { code: row.reasonCode, text: row.reasonText, rule: row.reasonRule };
}
