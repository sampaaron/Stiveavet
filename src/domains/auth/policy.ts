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
  /**
   * Seuls les échecs comptent : une personne qui se connecte souvent n'est jamais bloquée.
   * Par compte et par lieu (appareil de confiance ou adresse IP), puis par compte au total.
   */
  loginFailuresPerAccountAndPlace: [5, 15],
  loginFailuresPerAccount: [25, 15],
  loginPerIp: [30, 15],
  unlockFailuresPerAccount: [5, 15],
  /**
   * Mot de passe refusé dans « Mon compte » (changement de mot de passe, ajout d'une clé
   * d'accès) : la session est alors fermée.
   */
  passwordChangeFailuresPerAccount: [5, 15],
  /** Codes e-mail envoyés : 5 essais chacun, soit 30 essais par heure au plus. */
  securityCodesPerAccount: [6, 60],
  resetPerAccount: [3, 60],
  resetPerIp: [10, 60],
  /** Nouveaux mots de passe envoyés depuis un lien, valable ou non. */
  resetAttemptsPerIp: [20, 60],
  signupPerIp: [5, 60],
  /** Invitations envoyées par un cabinet en 24 heures, annulées comprises (ADR 0039). */
  invitationsPerOrganization: [20, 24 * 60],
} as const satisfies Record<string, readonly [number, number]>;

export type RateLimitName = keyof typeof RATE_LIMITS;

/**
 * Version des conditions d'utilisation acceptées à l'inscription, consignée dans le journal
 * d'activité du cabinet. Les conditions sont un projet tant qu'un juriste ne les a pas validées.
 */
export const TERMS_VERSION = "2026-10-07-projet";
