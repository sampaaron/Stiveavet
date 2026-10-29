import { describe, expect, it } from "vitest";

import { encodeConsent, parseConsent } from "./cookies";

const now = new Date("2026-10-29T12:00:00Z");

describe("choix des cookies", () => {
  it("se relit tel qu'il a été donné", () => {
    const consent = { audience: true, marketing: false, givenAt: now };
    expect(encodeConsent(consent)).toBe("v1.10.1793275200");
    expect(parseConsent(encodeConsent(consent), now)).toEqual(consent);
  });

  it("revient au bout de six mois, ou s'il est illisible", () => {
    const value = encodeConsent({
      audience: false,
      marketing: false,
      givenAt: now,
    });
    expect(parseConsent(value, new Date("2027-04-28T12:00:00Z"))).not.toBe(
      null,
    );
    expect(parseConsent(value, new Date("2027-04-29T12:00:00Z"))).toBe(null);
    expect(parseConsent("v2.11.1793275200", now)).toBe(null);
    expect(parseConsent("v1.11.9999999999", now)).toBe(null);
    expect(parseConsent("tout accepté", now)).toBe(null);
    expect(parseConsent(undefined, now)).toBe(null);
  });
});
