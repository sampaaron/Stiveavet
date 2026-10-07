import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

/**
 * Tests d'intégration contre un vrai PostgreSQL. Chaque exécution crée une base neuve,
 * y applique les migrations et le jeu fictif, puis la supprime.
 * Requiert TEST_DATABASE_ADMIN_URL (superutilisateur d'une instance locale ou de CI).
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "server-only": new URL("./tests/support/empty.ts", import.meta.url)
        .pathname,
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/integration/support/global-setup.ts"],
    // Une seule base partagée : les fichiers s'exécutent l'un après l'autre.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
