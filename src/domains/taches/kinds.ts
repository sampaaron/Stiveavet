/**
 * Codes d'erreur des tâches. Un code d'erreur est technique et court : jamais le message brut
 * d'une exception, qui pourrait contenir un numéro ou un contenu clinique. Les libellés des
 * tâches et des erreurs sont dans les dictionnaires de l'espace cabinet (`tasks`, ADR 0022).
 */

export const JOB_ERROR_CODES = [
  "provider_unavailable",
  "provider_rejected",
  "invalid_payload",
  "target_missing",
  "lease_expired",
  "unexpected_error",
] as const;
export type JobErrorCode = (typeof JOB_ERROR_CODES)[number];

/** Code d'erreur affichable : un code inconnu ou absent devient `unexpected_error`. */
export function jobErrorCode(code: string | null): JobErrorCode {
  return code && (JOB_ERROR_CODES as readonly string[]).includes(code)
    ? (code as JobErrorCode)
    : "unexpected_error";
}

/** Échec voulu par un exécutant : seul le code est enregistré. */
export class JobError extends Error {
  constructor(readonly code: JobErrorCode) {
    super(code);
  }
}

export const JOB_KIND_PATTERN = /^[a-z_]+\.[a-z_]+$/;
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9:._-]{8,200}$/;
