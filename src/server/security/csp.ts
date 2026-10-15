/**
 * Construit la Content-Security-Policy stricte de Stivea Vet.
 * Aucun domaine tiers n'est autorisé : polices, images et scripts sont servis par l'application.
 * Seule exception : la page de connexion du numéro WhatsApp réel, qui charge l'inscription
 * intégrée de Meta (`metaSignup`, ADR 0024) ; ses domaines ne valent que sur cette page.
 * `'unsafe-eval'` n'est accepté qu'en développement (exigence de React pour ses traces d'erreur).
 */
const META_SIGNUP_HOSTS = {
  script: ["https://connect.facebook.net"],
  frame: [
    "https://www.facebook.com",
    "https://web.facebook.com",
    "https://staticxx.facebook.com",
  ],
  connect: [
    "https://connect.facebook.net",
    "https://graph.facebook.com",
    "https://www.facebook.com",
  ],
  img: ["https://www.facebook.com"],
} as const;

export function buildContentSecurityPolicy(
  nonce: string,
  isDev: boolean,
  options: { metaSignup?: boolean } = {},
): string {
  const meta = options.metaSignup === true;
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
      ...(meta ? META_SIGNUP_HOSTS.script : []),
    ],
    "style-src": ["'self'", `'nonce-${nonce}'`],
    // Attributs `style="…"` seulement (posés par React et next/image) : ils ne peuvent pas
    // exécuter de script. Les balises <style> restent soumises au nonce.
    "style-src-attr": ["'unsafe-inline'"],
    "img-src": [
      "'self'",
      "blob:",
      "data:",
      ...(meta ? META_SIGNUP_HOSTS.img : []),
    ],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(meta ? META_SIGNUP_HOSTS.connect : [])],
    ...(meta ? { "frame-src": [...META_SIGNUP_HOSTS.frame] } : {}),
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const policy = Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
  return isDev ? policy : `${policy}; upgrade-insecure-requests`;
}

/** Nonce aléatoire et imprévisible, régénéré à chaque requête. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
