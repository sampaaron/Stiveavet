import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDayTitle,
  formatDuration,
  formatEuros,
  formatMinutes,
  formatRelativeDayTime,
  formatRelativeMoment,
  shortPersonName,
} from "./format";

// Mercredi 7 octobre 2026, 22 h 30 à Paris (heure d'été : UTC+2).
const now = new Date("2026-10-07T20:30:00Z");
const paris = (iso: string) => new Date(`${iso}+02:00`);

describe("dates relatives, heure de Paris", () => {
  it("titre du jour", () => {
    expect(formatDayTitle(now, "fr")).toBe("Mercredi 7 octobre");
  });

  it("moment d'une dernière nouvelle", () => {
    expect(formatRelativeMoment(paris("2026-10-07T21:12:00"), now, "fr")).toBe(
      "21:12",
    );
    expect(formatRelativeMoment(paris("2026-10-06T18:20:00"), now, "fr")).toBe(
      "Hier",
    );
    expect(formatRelativeMoment(paris("2026-10-05T09:00:00"), now, "fr")).toBe(
      "Lundi",
    );
    expect(formatRelativeMoment(paris("2026-09-20T09:00:00"), now, "fr")).toBe(
      "20 sept.",
    );
  });

  it("jour et heure, passés ou à venir, sans se tromper de jour vers minuit", () => {
    expect(formatRelativeDayTime(paris("2026-10-07T00:10:00"), now, "fr")).toBe(
      "Aujourd'hui, 00:10",
    );
    expect(formatRelativeDayTime(paris("2026-10-06T23:50:00"), now, "fr")).toBe(
      "Hier, 23:50",
    );
    expect(formatRelativeDayTime(paris("2026-10-08T09:00:00"), now, "fr")).toBe(
      "Demain, 09:00",
    );
    expect(formatRelativeDayTime(paris("2026-10-12T17:15:00"), now, "fr")).toBe(
      "Lundi, 17:15",
    );
    expect(formatRelativeDayTime(paris("2026-10-20T10:00:00"), now, "fr")).toBe(
      "20 oct., 10:00",
    );
  });

  it("durées et noms courts", () => {
    expect(
      formatDuration(now, new Date(now.getTime() + 20 * 60_000), "fr"),
    ).toBe("20 min");
    expect(
      formatDuration(now, new Date(now.getTime() + 90 * 60_000), "fr"),
    ).toBe("1 h 30");
    expect(
      formatDuration(now, new Date(now.getTime() + 120 * 60_000), "fr"),
    ).toBe("2 h");
    expect(formatMinutes(90, "en")).toBe("1 h 30 min");
    expect(shortPersonName("Dr Claire Fontaine")).toBe("Dr Fontaine");
    expect(shortPersonName("Léa Roux")).toBe("Léa Roux");
  });
});

describe("en anglais (usage britannique, heure de Paris)", () => {
  it("dates, jours relatifs et montants", () => {
    expect(formatDayTitle(now, "en")).toBe("Wednesday 7 October");
    expect(formatRelativeMoment(paris("2026-10-06T18:20:00"), now, "en")).toBe(
      "Yesterday",
    );
    expect(formatRelativeMoment(paris("2026-10-05T09:00:00"), now, "en")).toBe(
      "Monday",
    );
    expect(formatRelativeDayTime(paris("2026-10-08T09:00:00"), now, "en")).toBe(
      "Tomorrow, 09:00",
    );
    expect(formatRelativeDayTime(paris("2026-10-20T10:00:00"), now, "en")).toBe(
      "20 Oct, 10:00",
    );
    expect(formatDate(now, "en")).toBe("7 October 2026");
    expect(formatEuros(8600, "en")).toBe("€86.00");
  });
});
