import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { fingerprint, parseFingerprintKey } from "./fingerprint";

describe("clé des empreintes", () => {
  it("dérive une clé stable en local seulement", () => {
    expect(parseFingerprintKey({})).toEqual(
      parseFingerprintKey({ APP_ENV: "local" }),
    );
    expect(parseFingerprintKey({})).toHaveLength(32);
  });

  it("refuse de démarrer hors local sans clé, sans citer de valeur", () => {
    for (const APP_ENV of ["staging", "production"])
      expect(() => parseFingerprintKey({ APP_ENV })).toThrow(
        "Configuration invalide : FINGERPRINT_SECRET",
      );
    expect(() =>
      parseFingerprintKey({
        APP_ENV: "production",
        FINGERPRINT_SECRET: "court",
      }),
    ).toThrow("Configuration invalide : FINGERPRINT_SECRET");
  });

  it("prend la clé fournie, qui change les empreintes", () => {
    const secret = randomBytes(32).toString("base64url");
    expect(
      parseFingerprintKey({
        APP_ENV: "production",
        FINGERPRINT_SECRET: secret,
      }),
    ).toEqual(Buffer.from(secret, "utf8"));
    expect(
      parseFingerprintKey({ APP_ENV: "local", FINGERPRINT_SECRET: secret }),
    ).not.toEqual(parseFingerprintKey({}));
  });

  it("produit une HMAC-SHA256 hexadécimale, stable pour une même valeur", () => {
    expect(fingerprint("203.0.113.7")).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint("203.0.113.7")).toBe(fingerprint("203.0.113.7"));
    expect(fingerprint("203.0.113.7")).not.toBe(fingerprint("203.0.113.8"));
  });
});
