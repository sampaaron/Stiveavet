/**
 * Règles d'authentification (architecture §8, plan phase 1 §5).
 * Toute modification de ces valeurs passe par une ADR.
 */
export const AUTH_POLICY = {
  /** Verrouillage après inactivité, contrôlé côté serveur. */
  idleLockMinutes: 40,
  /** Durée maximale d'une session, verrouillée ou non. */
  sessionHours: 12,
  /** Code de sécurité e-mail des vétérinaires. */
  codeMinutes: 10,
  codeMaxAttempts: 5,
  /** Appareil reconnu après un code valide. */
  trustedDeviceDays: 90,
  /** Lien de réinitialisation, utilisable une seule fois. */
  resetMinutes: 30,
  password: { minLength: 12, maxLength: 128 },
} as const;

/** Limites de tentatives : [nombre maximal, fenêtre en minutes]. */
export const RATE_LIMITS = {
  /** Seuls les échecs comptent : une personne qui se connecte souvent n'est jamais bloquée. */
  loginFailuresPerAccount: [5, 15],
  loginPerIp: [30, 15],
  unlockFailuresPerAccount: [5, 15],
  resetPerAccount: [3, 60],
  resetPerIp: [10, 60],
  signupPerIp: [5, 60],
} as const satisfies Record<string, readonly [number, number]>;

export type RateLimitName = keyof typeof RATE_LIMITS;
