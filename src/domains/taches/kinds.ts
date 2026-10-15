/**
 * Codes d'erreur des tâches. Un code d'erreur est technique et court : jamais le message brut
 * d'une exception, qui pourrait contenir un numéro ou un contenu clinique. Les libellés des
 * tâches et des erreurs sont dans les dictionnaires de l'espace cabinet (`tasks`, ADR 0022).
 */

export const JOB_ERROR_CODES = [
  "provider_unavailable",
  "provider_rejected",
  "provider_account",
  "recipient_unreachable",
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

/**
 * Échec voulu par un exécutant : seul le code est enregistré. `final` : inutile de
 * réessayer (numéro injoignable, compte à reconnecter) ; la tâche passe tout de suite en échec.
 */
export class JobError extends Error {
  readonly final: boolean;
  constructor(
    readonly code: JobErrorCode,
    options: { final?: boolean } = {},
  ) {
    super(code);
    this.final = options.final ?? false;
  }
}

export const JOB_KIND_PATTERN = /^[a-z_]+\.[a-z_]+$/;
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9:._-]{8,200}$/;
