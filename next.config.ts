import type { NextConfig } from "next";

import {
  openerPolicyRules,
  staticSecurityHeaders,
} from "./src/server/security/headers";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    // Photos et captures d'agenda : 5 Mo au plus, vérifiés ensuite par le serveur (ADR 0019).
    serverActions: { bodySizeLimit: "6mb" },
  },
  // Pas de pré-rendu statique partiel : chaque page doit recevoir le nonce CSP de sa requête
  // (voir docs/adr/0003-csp-nonce-rendu-dynamique.md). Valeur par défaut, écrite pour rester visible.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: staticSecurityHeaders.map((header) => ({ ...header })),
      },
      ...openerPolicyRules,
    ];
  },
};

export default nextConfig;
