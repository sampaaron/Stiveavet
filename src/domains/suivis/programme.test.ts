import { describe, expect, it } from "vitest";

import { automaticEndAt, stepsToSchedule } from "./programme";

const windows = [1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  startsAt: "08:00",
  endsAt: "20:00",
}));

const steps = [4, 12, 24, 48].map((offsetHours) => ({
  id: `etape-${offsetHours}`,
  offsetHours,
}));

describe("heure d'envoi des rappels (heure de Paris)", () => {
  it("une étape dans la plage part à son heure ; en dehors, au début de la plage suivante", () => {
    // Intervention le mercredi 7 octobre 2026 à 10 h à Paris (8 h UTC, heure d'été).
    const procedureAt = new Date("2026-10-07T08:00:00Z");
    const planned = stepsToSchedule({
      steps,
      procedureAt,
      endAt: new Date("2026-10-17T08:00:00Z"),
      windows,
      now: procedureAt,
    });
    expect(
      planned.map(({ step, runAt }) => [step.id, runAt.toISOString()]),
    ).toEqual([
      // 14 h : dans la plage.
      ["etape-4", "2026-10-07T12:00:00.000Z"],
      // 22 h : reporté au lendemain 8 h.
      ["etape-12", "2026-10-08T06:00:00.000Z"],
      ["etape-24", "2026-10-08T08:00:00.000Z"],
      ["etape-48", "2026-10-09T08:00:00.000Z"],
    ]);
  });

  it("passage à l'heure d'hiver : la plage reste 8 h à Paris, l'heure UTC change", () => {
    // Samedi 24 octobre 2026, 19 h à Paris (17 h UTC) ; la nuit suivante, on recule d'une heure.
    const procedureAt = new Date("2026-10-24T17:00:00Z");
    const planned = stepsToSchedule({
      steps: [
        { id: "nuit", offsetHours: 4 },
        { id: "lendemain", offsetHours: 38 },
      ],
      procedureAt,
      endAt: new Date("2026-11-03T09:00:00Z"),
      windows,
      now: procedureAt,
    });
    expect(planned.map(({ runAt }) => runAt.toISOString())).toEqual([
      // 23 h samedi → dimanche fermé → lundi 26 octobre 8 h (heure d'hiver, 7 h UTC).
      "2026-10-26T07:00:00.000Z",
      // Lundi 26, 7 h UTC = 8 h à Paris : pile à l'ouverture.
      "2026-10-26T07:00:00.000Z",
    ]);
    // Le délai en heures reste exact : 38 h après 17 h UTC = lundi 7 h UTC.
    expect(planned[1]?.dueAt.toISOString()).toBe("2026-10-26T07:00:00.000Z");
  });

  it("passage à l'heure d'été : 8 h à Paris vaut 6 h UTC", () => {
    // Samedi 28 mars 2026, 21 h à Paris (20 h UTC) ; dimanche 29, on avance d'une heure.
    const planned = stepsToSchedule({
      steps: [{ id: "lundi", offsetHours: 2 }],
      procedureAt: new Date("2026-03-28T20:00:00Z"),
      endAt: new Date("2026-04-10T08:00:00Z"),
      windows,
      now: new Date("2026-03-28T20:00:00Z"),
    });
    expect(planned[0]?.runAt.toISOString()).toBe("2026-03-30T06:00:00.000Z");
  });

  it("jamais les étapes passées, sauf celle qui vient de passer, envoyée tout de suite", () => {
    const procedureAt = new Date("2026-10-07T06:00:00Z");
    const now = new Date("2026-10-07T11:00:00Z"); // intervention + 5 h, 13 h à Paris.
    const planned = stepsToSchedule({
      steps: [
        { id: "ancienne", offsetHours: 2 },
        { id: "recente", offsetHours: 4 },
        { id: "future", offsetHours: 6 },
      ],
      procedureAt,
      endAt: new Date("2026-10-17T08:00:00Z"),
      windows,
      now,
    });
    expect(
      planned.map(({ step, runAt }) => [step.id, runAt.toISOString()]),
    ).toEqual([
      ["recente", now.toISOString()],
      ["future", "2026-10-07T12:00:00.000Z"],
    ]);
  });

  it("aucune étape à partir de la fin du suivi automatisé", () => {
    const procedureAt = new Date("2026-10-07T08:00:00Z");
    const planned = stepsToSchedule({
      steps: [
        { id: "avant", offsetHours: 24 },
        { id: "fin", offsetHours: 48 },
        // Due avant la fin, mais reportée après elle par la plage d'envoi.
        { id: "reportee", offsetHours: 34 },
      ],
      procedureAt,
      endAt: new Date("2026-10-09T05:00:00Z"),
      windows,
      now: procedureAt,
    });
    expect(planned.map(({ step }) => step.id)).toEqual(["avant"]);
  });
});

describe("fin du suivi automatisé", () => {
  const procedureAt = new Date("2026-10-07T08:00:00Z");

  it("à la date de contrôle", () => {
    const control = new Date("2026-10-17T09:00:00Z");
    expect(
      automaticEndAt({
        procedureAt,
        controlAppointmentAt: control,
        stepOffsets: [4, 216],
      }),
    ).toEqual(control);
  });

  it("sans contrôle, un jour après la dernière étape", () => {
    expect(
      automaticEndAt({
        procedureAt,
        controlAppointmentAt: null,
        stepOffsets: [4, 120, 48],
      }),
    ).toEqual(new Date("2026-10-13T08:00:00Z"));
    expect(
      automaticEndAt({
        procedureAt,
        controlAppointmentAt: null,
        stepOffsets: [],
      }),
    ).toEqual(new Date("2026-10-08T08:00:00Z"));
  });
});
