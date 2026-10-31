import { describe, expect, it } from "vitest";

import { workerConfig } from "./config";

const WORKER_DATABASE_URL = "postgres://stivea_worker:x@localhost:5432/stivea";

describe("configuration du worker", () => {
  it("valeurs par défaut en local", () => {
    expect(workerConfig({ WORKER_DATABASE_URL })).toEqual({
      databaseUrl: WORKER_DATABASE_URL,
      intervalMs: 5_000,
      appUrl: "http://localhost:3000",
    });
  });

  it("refuse un intervalle illisible ou hors bornes, sans citer la valeur", () => {
    for (const WORKER_INTERVAL_MS of ["abc", "", "0", "100", "120000", "1.5"])
      expect(() =>
        workerConfig({ WORKER_DATABASE_URL, WORKER_INTERVAL_MS }),
      ).toThrow("Configuration invalide : WORKER_INTERVAL_MS");
    expect(
      workerConfig({ WORKER_DATABASE_URL, WORKER_INTERVAL_MS: "2000" })
        .intervalMs,
    ).toBe(2_000);
  });

  it("exige la base et, hors local, une adresse publique en HTTPS", () => {
    expect(() => workerConfig({})).toThrow("WORKER_DATABASE_URL");
    expect(() => workerConfig({ WORKER_DATABASE_URL: "pas-une-url" })).toThrow(
      /^Configuration invalide : WORKER_DATABASE_URL$/,
    );
    expect(() =>
      workerConfig({ APP_ENV: "staging", WORKER_DATABASE_URL }),
    ).toThrow("APP_URL");
    expect(() =>
      workerConfig({
        APP_ENV: "staging",
        WORKER_DATABASE_URL,
        APP_URL: "http://localhost:3000",
      }),
    ).toThrow("APP_URL");
    expect(
      workerConfig({
        APP_ENV: "production",
        WORKER_DATABASE_URL,
        APP_URL: "https://app.stivea.fr",
      }).appUrl,
    ).toBe("https://app.stivea.fr");
  });
});
