/**
 * Consentement aux cookies (ADR 0053, recommandations de la CNIL). Les cookies nécessaires
 * (connexion, langue, mode d'affichage, ce choix lui-même) n'en demandent pas. Les finalités
 * facultatives sont refusées par défaut et rien ne s'y dépose sans accord. Aujourd'hui, aucun
 * outil n'y est branché.
 */
export const OPTIONAL_PURPOSES = ["audience", "marketing"] as const;
export type OptionalPurpose = (typeof OPTIONAL_PURPOSES)[number];

/** Le choix vaut six mois, puis le bandeau revient. */
export const CONSENT_MONTHS = 6;
/** Changer la liste des finalités demande un nouveau choix : on change cette version. */
export const CONSENT_VERSION = 1;

export type Consent = Record<OptionalPurpose, boolean> & { givenAt: Date };

const FORMAT = /^v(\d+)\.([01])([01])\.(\d{10})$/;

/** `v1.<audience><marketing>.<secondes>` : rien d'identifiant, seulement le choix et sa date. */
export function encodeConsent(consent: Consent): string {
  const flags = OPTIONAL_PURPOSES.map((purpose) => (consent[purpose] ? 1 : 0));
  return `v${CONSENT_VERSION}.${flags.join("")}.${Math.floor(consent.givenAt.getTime() / 1000)}`;
}

/** Choix en vigueur ; null s'il manque, est illisible, d'une autre version ou trop ancien. */
export function parseConsent(
  value: string | undefined,
  now: Date,
): Consent | null {
  const match = value ? FORMAT.exec(value) : null;
  if (!match || Number(match[1]) !== CONSENT_VERSION) return null;
  const givenAt = new Date(Number(match[4]) * 1000);
  const expiresAt = new Date(givenAt);
  expiresAt.setMonth(expiresAt.getMonth() + CONSENT_MONTHS);
  if (givenAt > now || expiresAt <= now) return null;
  return { audience: match[2] === "1", marketing: match[3] === "1", givenAt };
}

export function consentMaxAgeSeconds(): number {
  return Math.round((CONSENT_MONTHS * 365.25 * 24 * 3600) / 12);
}

/** Cookies déposés par Stivea Vet, tous nécessaires : la politique de cookies les liste. */
export const COOKIE_CATALOG = [
  { name: "sv_session", purpose: "session", duration: "session" },
  { name: "sv_device", purpose: "device", duration: "device" },
  { name: "sv_challenge", purpose: "challenge", duration: "challenge" },
  { name: "sv_demo", purpose: "demo", duration: "demo" },
  { name: "sv_lang", purpose: "lang", duration: "year" },
  { name: "sv_mode", purpose: "mode", duration: "year" },
  { name: "sv_consent", purpose: "consent", duration: "consent" },
] as const;

export type CookiePurpose = (typeof COOKIE_CATALOG)[number]["purpose"];
export type CookieDuration = (typeof COOKIE_CATALOG)[number]["duration"];
