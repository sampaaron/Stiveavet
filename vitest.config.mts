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
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
    environment: "node",
    // Le moteur de règles de facturation doit rester couvert à 100 % (plan de la phase 1).
    coverage: {
      provider: "v8",
      include: ["src/domains/facturation/rules.ts"],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
