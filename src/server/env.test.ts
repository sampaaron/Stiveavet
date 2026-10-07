import { describe, expect, it } from "vitest";

import { parseServerEnv } from "./env";

describe("parseServerEnv", () => {
  it("applique les valeurs locales par défaut", () => {
    expect(parseServerEnv({})).toMatchObject({
      APP_ENV: "local",
      APP_URL: "http://localhost:3000",
    });
  });

  it("refuse un environnement inconnu", () => {
    expect(() => parseServerEnv({ APP_ENV: "demo" })).toThrow("APP_ENV");
  });

  it("exige HTTPS et l'IP du répartiteur hors local", () => {
    expect(() =>
      parseServerEnv({ APP_ENV: "production", APP_URL: "http://stivea.test" }),
    ).toThrow(
      "Configuration invalide : TRUST_PROXY, FILE_LINK_SECRET, APP_URL",
    );
    expect(
      parseServerEnv({
        APP_ENV: "production",
        APP_URL: "https://stivea.test",
        TRUST_PROXY: "true",
        FILE_LINK_SECRET: "x".repeat(48),
      }).TRUST_PROXY,
    ).toBe(true);
  });

  it("refuse une clé de liens trop courte et un dossier de stockage relatif", () => {
    expect(() => parseServerEnv({ FILE_LINK_SECRET: "court" })).toThrow(
      "FILE_LINK_SECRET",
    );
    expect(() => parseServerEnv({ OBJECT_STORAGE_DIR: "data" })).toThrow(
      "OBJECT_STORAGE_DIR",
    );
  });

  it("ne révèle jamais la valeur fautive dans l'erreur", () => {
    const secret = "motdepasse-secret-sans-schema";

    const error = captureError(() => parseServerEnv({ DATABASE_URL: secret }));

    expect(error.message).toBe("Configuration invalide : DATABASE_URL");
    expect(error.message).not.toContain(secret);
  });
});

function captureError(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error("Une erreur était attendue");
}
