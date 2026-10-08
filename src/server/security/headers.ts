/**
 * En-têtes de sécurité appliqués à toutes les réponses.
 * La Content-Security-Policy, qui dépend d'un nonce par requête, est posée par `src/proxy.ts`.
 */
export const staticSecurityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
] as const satisfies ReadonlyArray<{ key: string; value: string }>;

/**
 * Isolation des fenêtres : stricte partout, sauf sur les pages de connexion du numéro
 * WhatsApp, où la fenêtre de Meta ouverte par la page doit pouvoir lui répondre (ADR 0024).
 */
export const openerPolicyRules = [
  {
    source: "/((?!app/reglages$|app/demarrage$).*)",
    headers: [{ key: "Cross-Origin-Opener-Policy", value: "same-origin" }],
  },
  {
    source: "/app/:page(reglages|demarrage)",
    headers: [
      {
        key: "Cross-Origin-Opener-Policy",
        value: "same-origin-allow-popups",
      },
    ],
  },
];
