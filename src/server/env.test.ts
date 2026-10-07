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
