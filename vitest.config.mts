import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    // `server-only` refuse d'être importé hors du serveur React ; neutralisé pour les tests unitaires.
    alias: {
      "server-only": new URL("./tests/support/empty.ts", import.meta.url)
        .pathname,
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Couverture totale exigée des règles critiques : facturation (plan de la phase 1), droits
    // de l'équipe, CSP, assainissement des erreurs de base et adresse IP du client (ADR 0041).
    coverage: {
      provider: "v8",
      include: [
        "src/domains/facturation/rules.ts",
        "src/domains/equipe/matrix.ts",
        "src/domains/equipe/permissions.ts",
        "src/server/security/csp.ts",
        "src/server/db/errors.ts",
        "src/server/http/client-ip.ts",
      ],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
