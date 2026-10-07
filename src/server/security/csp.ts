/**
 * Construit la Content-Security-Policy stricte de Stivea Vet.
 * Aucun domaine tiers n'est autorisé : polices, images et scripts sont servis par l'application.
 * `'unsafe-eval'` n'est accepté qu'en développement (exigence de React pour ses traces d'erreur).
 */
export function buildContentSecurityPolicy(
  nonce: string,
  isDev: boolean,
): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", `'nonce-${nonce}'`],
    // Attributs `style="…"` seulement (posés par React et next/image) : ils ne peuvent pas
    // exécuter de script. Les balises <style> restent soumises au nonce.
    "style-src-attr": ["'unsafe-inline'"],
    "img-src": ["'self'", "blob:", "data:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'"],
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
