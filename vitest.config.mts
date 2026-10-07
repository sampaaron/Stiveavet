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
  },
});
