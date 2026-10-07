import { describe, expect, it } from "vitest";

import {
  escalationLabel,
  messageWindowsInput,
  parisLocalToDate,
} from "./content";

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

describe("réglages", () => {
  it("affiche le délai d'escalade en heures", () => {
    expect(escalationLabel(240)).toBe("4 h");
    expect(escalationLabel(210)).toBe("3 h 30");
  });

  it("refuse deux plages le même jour", () => {
    expect(
      messageWindowsInput.safeParse([
        { weekday: 1, startsAt: "08:00", endsAt: "12:00" },
        { weekday: 1, startsAt: "14:00", endsAt: "18:00" },
      ]).success,
    ).toBe(false);
  });
});
