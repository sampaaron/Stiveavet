/**
 * Catalogue des tâches et des codes d'erreur. Un code d'erreur est technique et court : jamais
 * le message brut d'une exception, qui pourrait contenir un numéro ou un contenu clinique.
 */

/** Libellés des tâches connues ; les lots suivants en ajoutent (rappels, escalades…). */
export const JOB_KIND_LABELS: Record<string, string> = {
  "followup.reminder": "Rappel au propriétaire",
  "followup.message": "Message de Numa",
  "alert.escalate": "Escalade d'une alerte urgente",
  "alert.notify": "Alerte au vétérinaire",
};

export function jobKindLabel(kind: string): string {
  return JOB_KIND_LABELS[kind] ?? "Tâche technique";
}

export const JOB_ERROR_CODES = [
  "provider_unavailable",
  "provider_rejected",
  "invalid_payload",
  "target_missing",
  "lease_expired",
  "unexpected_error",
] as const;
export type JobErrorCode = (typeof JOB_ERROR_CODES)[number];

export const JOB_ERROR_LABELS: Record<JobErrorCode, string> = {
  provider_unavailable: "Service d'envoi indisponible",
  provider_rejected: "Envoi refusé par le service",
  invalid_payload: "Données de la tâche invalides",
  target_missing: "Dossier ou destinataire introuvable",
  lease_expired: "Interrompue par un arrêt du worker",
  unexpected_error: "Erreur inattendue",
};

export function jobErrorLabel(code: string | null): string {
  if (!code) return JOB_ERROR_LABELS.unexpected_error;
  return (JOB_ERROR_CODES as readonly string[]).includes(code)
    ? JOB_ERROR_LABELS[code as JobErrorCode]
    : JOB_ERROR_LABELS.unexpected_error;
}

/** Échec voulu par un exécutant : seul le code est enregistré. */
export class JobError extends Error {
  constructor(readonly code: JobErrorCode) {
    super(code);
  }
}

export const JOB_KIND_PATTERN = /^[a-z_]+\.[a-z_]+$/;
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9:._-]{8,200}$/;
