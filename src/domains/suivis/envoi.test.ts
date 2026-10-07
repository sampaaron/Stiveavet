import { describe, expect, it } from "vitest";

import { nextSendTime } from "./envoi";

const weekdays = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startsAt: "08:00",
  endsAt: "20:00",
}));

describe("plage d'envoi", () => {
  it("garde l'heure prévue quand elle tombe dans la plage", () => {
    // Mercredi 7 octobre 2026, 14 h à Paris (UTC+2).
    const at = new Date("2026-10-07T12:00:00Z");
    expect(nextSendTime(weekdays, at)).toEqual(at);
  });

  it("repousse un envoi de nuit au début de la plage suivante", () => {
    // Mercredi 22 h à Paris → jeudi 8 h.
    expect(nextSendTime(weekdays, new Date("2026-10-07T20:00:00Z"))).toEqual(
      new Date("2026-10-08T06:00:00Z"),
    );
    // Mercredi 6 h à Paris → mercredi 8 h.
    expect(nextSendTime(weekdays, new Date("2026-10-07T04:00:00Z"))).toEqual(
      new Date("2026-10-07T06:00:00Z"),
    );
  });

  it("saute le week-end et suit le changement d'heure", () => {
    // Vendredi 23 octobre 2026, 21 h (UTC+2) → lundi 26 octobre 8 h (UTC+1, heure d'hiver).
    expect(nextSendTime(weekdays, new Date("2026-10-23T19:00:00Z"))).toEqual(
      new Date("2026-10-26T07:00:00Z"),
    );
  });

  it("sans plage réglée, applique les plages de départ (lundi à samedi, 8 h - 20 h)", () => {
    // Dimanche 11 octobre 2026, 10 h → lundi 8 h.
    expect(nextSendTime([], new Date("2026-10-11T08:00:00Z"))).toEqual(
      new Date("2026-10-12T06:00:00Z"),
    );
  });
});
