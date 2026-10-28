import { describe, expect, it } from "vitest";

import { workerConfig } from "./config";

const DATABASE_URL = "postgres://stivea_app:x@localhost:5432/stivea";

describe("configuration du worker", () => {
  it("valeurs par défaut en local", () => {
    expect(workerConfig({ DATABASE_URL })).toEqual({
      databaseUrl: DATABASE_URL,
      intervalMs: 5_000,
      appUrl: "http://localhost:3000",
    });
  });

  it("refuse un intervalle illisible ou hors bornes, sans citer la valeur", () => {
    for (const WORKER_INTERVAL_MS of ["abc", "", "0", "100", "120000", "1.5"])
      expect(() => workerConfig({ DATABASE_URL, WORKER_INTERVAL_MS })).toThrow(
        "Configuration invalide : WORKER_INTERVAL_MS",
      );
    expect(
      workerConfig({ DATABASE_URL, WORKER_INTERVAL_MS: "2000" }).intervalMs,
    ).toBe(2_000);
  });

  it("exige la base et, hors local, une adresse publique en HTTPS", () => {
    expect(() => workerConfig({})).toThrow("DATABASE_URL");
    expect(() => workerConfig({ DATABASE_URL: "pas-une-url" })).toThrow(
      /^Configuration invalide : DATABASE_URL$/,
    );
    expect(() => workerConfig({ APP_ENV: "staging", DATABASE_URL })).toThrow(
      "APP_URL",
    );
    expect(() =>
      workerConfig({
        APP_ENV: "staging",
        DATABASE_URL,
        APP_URL: "http://localhost:3000",
      }),
    ).toThrow("APP_URL");
    expect(
      workerConfig({
        APP_ENV: "production",
        DATABASE_URL,
        APP_URL: "https://app.stivea.fr",
      }).appUrl,
    ).toBe("https://app.stivea.fr");
  });
});
