import { describe, expect, it } from "vitest";

import { formatPrice, isLocale } from "./locales";

describe("langues", () => {
  it("reconnaît seulement le français et l'anglais", () => {
    expect(isLocale("fr")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("affiche les prix sans décimales inutiles", () => {
    expect(formatPrice(8_600, "fr")).toBe("86 €");
    expect(formatPrice(250, "fr")).toBe("2,50 €");
    expect(formatPrice(8_600, "en")).toBe("€86");
    expect(formatPrice(126, "en")).toBe("€1.26");
  });
});
