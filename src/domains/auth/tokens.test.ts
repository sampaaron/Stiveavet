import { describe, expect, it } from "vitest";

import {
  createSecurityCode,
  createToken,
  ipFingerprint,
  isWellFormedToken,
  rateLimitBucket,
  securityCodeHash,
  tokenHash,
} from "./tokens";

describe("jetons et codes", () => {
  it("produit des jetons de 256 bits bien formés et uniques", () => {
    const tokens = new Set(Array.from({ length: 100 }, createToken));
    expect(tokens.size).toBe(100);
    for (const token of tokens) expect(isWellFormedToken(token)).toBe(true);
    expect(isWellFormedToken("x' OR 1=1 --")).toBe(false);
    expect(tokenHash(createToken())).toHaveLength(32);
  });

  it("produit des codes à 6 chiffres liés à leur défi", () => {
    for (let index = 0; index < 200; index += 1)
      expect(createSecurityCode()).toMatch(/^\d{6}$/);
    const challenge = createToken();
    expect(securityCodeHash(challenge, "123456")).not.toEqual(
      securityCodeHash(createToken(), "123456"),
    );
  });

  it("ne garde jamais l'e-mail ou l'IP en clair", () => {
    const bucket = rateLimitBucket(
      "loginFailuresPerAccount",
      "Claire@Tilleuls.test",
    );
    expect(bucket).toMatch(/^login_failures_per_account:[0-9a-f]{64}$/);
    expect(bucket).not.toContain("claire");
    expect(bucket).toBe(
      rateLimitBucket("loginFailuresPerAccount", "claire@tilleuls.test"),
    );
    expect(ipFingerprint("203.0.113.7")).toMatch(/^[0-9a-f]{16}$/);
    expect(ipFingerprint(null)).toBeNull();
  });
});
