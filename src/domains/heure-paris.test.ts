import { describe, expect, it } from "vitest";

import {
  parisDate,
  parisDayIndex,
  parisLocalToDate,
  parisWallMinutes,
} from "./heure-paris";

describe("parisLocalToDate", () => {
  it("lit l'heure saisie à l'heure de Paris, été comme hiver", () => {
    expect(parisLocalToDate("2026-07-14T20:00")?.toISOString()).toBe(
      "2026-07-14T18:00:00.000Z",
    );
    expect(parisLocalToDate("2026-12-24T20:00")?.toISOString()).toBe(
      "2026-12-24T19:00:00.000Z",
    );
  });

  it("refuse une saisie mal formée", () => {
    expect(parisLocalToDate("2026-07-14 20:00")).toBeNull();
    expect(parisLocalToDate("")).toBeNull();
  });
});

describe("jour de Paris", () => {
  it("bascule à minuit à Paris, pas à minuit UTC", () => {
    // 23 h 30 UTC en été : déjà le lendemain à Paris.
    const lateUtc = new Date("2026-07-14T23:30:00Z");
    expect(parisDate(lateUtc)).toBe("2026-07-15");
    expect(parisDate(new Date("2026-12-31T22:59:00Z"))).toBe("2026-12-31");
    expect(parisDate(new Date("2026-12-31T23:00:00Z"))).toBe("2027-01-01");
    expect(
      parisDayIndex(lateUtc) - parisDayIndex(new Date("2026-07-14T21:00:00Z")),
    ).toBe(1);
    expect(parisWallMinutes(lateUtc) % 1440).toBe(90);
  });
});
