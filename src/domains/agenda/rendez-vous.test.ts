import { describe, expect, it } from "vitest";

import {
  appointmentKindOf,
  appointmentMessage,
  fitSlots,
  inApprovedWindow,
  slotChoice,
  slotLabel,
  wantsAppointment,
} from "./rendez-vous";

// Mardi 13 octobre 2026 : Paris est à UTC+2.
const at = (iso: string) => new Date(iso);
const TUESDAY = [{ weekday: 2, startsAt: "09:00", endsAt: "18:00" }];
const NOW = at("2026-10-12T08:00:00Z");

describe("plages approuvées", () => {
  it("accepte un créneau compris dans la plage du jour, à l'heure de Paris", () => {
    expect(
      inApprovedWindow(
        TUESDAY,
        at("2026-10-13T07:00:00Z"),
        at("2026-10-13T07:30:00Z"),
      ),
    ).toBe(true);
    expect(
      inApprovedWindow(
        TUESDAY,
        at("2026-10-13T15:40:00Z"),
        at("2026-10-13T16:00:00Z"),
      ),
    ).toBe(true);
  });

  it("refuse un créneau qui déborde, un autre jour ou à cheval sur minuit", () => {
    expect(
      inApprovedWindow(
        TUESDAY,
        at("2026-10-13T06:45:00Z"),
        at("2026-10-13T07:15:00Z"),
      ),
    ).toBe(false);
    expect(
      inApprovedWindow(
        TUESDAY,
        at("2026-10-13T15:50:00Z"),
        at("2026-10-13T16:10:00Z"),
      ),
    ).toBe(false);
    expect(
      inApprovedWindow(
        TUESDAY,
        at("2026-10-14T07:00:00Z"),
        at("2026-10-14T07:30:00Z"),
      ),
    ).toBe(false);
    expect(
      inApprovedWindow(
        [{ weekday: 2, startsAt: "00:00", endsAt: "23:59" }],
        at("2026-10-13T21:45:00Z"),
        at("2026-10-13T22:15:00Z"),
      ),
    ).toBe(false);
  });
});

describe("créneaux à proposer", () => {
  const free = [
    {
      startsAt: at("2026-10-13T07:30:00Z"),
      endsAt: at("2026-10-13T08:00:00Z"),
    },
    {
      startsAt: at("2026-10-13T09:00:00Z"),
      endsAt: at("2026-10-13T09:30:00Z"),
    },
    {
      startsAt: at("2026-10-13T12:30:00Z"),
      endsAt: at("2026-10-13T13:00:00Z"),
    },
    {
      startsAt: at("2026-10-13T14:00:00Z"),
      endsAt: at("2026-10-13T14:30:00Z"),
    },
    // Hors plage : 19 h 30 à Paris.
    {
      startsAt: at("2026-10-13T17:30:00Z"),
      endsAt: at("2026-10-13T18:00:00Z"),
    },
  ];

  it("propose au plus trois créneaux, les plus proches d'abord", () => {
    const slots = fitSlots({
      free: [...free].reverse(),
      windows: TUESDAY,
      busy: [],
      minutes: 20,
      now: NOW,
    });
    expect(slots.map((slot) => slot.toISOString())).toEqual([
      "2026-10-13T07:30:00.000Z",
      "2026-10-13T09:00:00.000Z",
      "2026-10-13T12:30:00.000Z",
    ]);
  });

  it("écarte un rendez-vous trop long, déjà pris, trop proche ou hors plage", () => {
    expect(
      fitSlots({ free, windows: TUESDAY, busy: [], minutes: 45, now: NOW }),
    ).toEqual([]);
    const busy = [
      {
        startsAt: at("2026-10-13T07:40:00Z"),
        endsAt: at("2026-10-13T08:00:00Z"),
      },
      {
        startsAt: at("2026-10-13T09:00:00Z"),
        endsAt: at("2026-10-13T09:20:00Z"),
      },
    ];
    expect(
      fitSlots({ free, windows: TUESDAY, busy, minutes: 20, now: NOW }).map(
        (slot) => slot.toISOString(),
      ),
    ).toEqual(["2026-10-13T12:30:00.000Z", "2026-10-13T14:00:00.000Z"]);
    // Moins d'une heure avant : pas proposé.
    expect(
      fitSlots({
        free,
        windows: TUESDAY,
        busy: [],
        minutes: 20,
        now: at("2026-10-13T06:45:00Z"),
      })[0]?.toISOString(),
    ).toBe("2026-10-13T09:00:00.000Z");
    // Aucune plage approuvée : rien, le cabinet rappellera.
    expect(
      fitSlots({ free, windows: [], busy: [], minutes: 20, now: NOW }),
    ).toEqual([]);
  });
});

describe("messages du propriétaire", () => {
  it("reconnaît une demande de rendez-vous, en français ou en anglais", () => {
    expect(
      wantsAppointment("Peut-on prendre rendez-vous pour le contrôle ?"),
    ).toBe(true);
    expect(wantsAppointment("un rdv la semaine prochaine ?")).toBe(true);
    expect(wantsAppointment("Can I book an appointment?")).toBe(true);
    expect(wantsAppointment("Elle mange bien ce matin")).toBe(false);
  });

  it("lit le choix d'un créneau, seulement s'il est sans ambiguïté", () => {
    expect(slotChoice("2")).toBe(2);
    expect(slotChoice(" le 3. ")).toBe(3);
    expect(slotChoice("Créneau 1")).toBe(1);
    expect(slotChoice("option 2")).toBe(2);
    expect(slotChoice("4")).toBeNull();
    expect(slotChoice("elle a vomi 2 fois")).toBeNull();
  });

  it("choisit le type de rendez-vous : l'urgence d'abord, puis le protocole", () => {
    expect(appointmentKindOf("surgery", true)).toBe("emergency");
    expect(appointmentKindOf("dental", false)).toBe("post_op_control");
    expect(appointmentKindOf("treatment", false)).toBe("treatment_followup");
    expect(appointmentKindOf(null, false)).toBe("other");
  });
});

describe("textes de Numa", () => {
  const wording = {
    language: "fr" as const,
    ownerFirstName: "Antoine",
    animalName: "Gaston",
    practiceName: "Clinique des Tilleuls",
    vetName: "Dr Claire Fontaine",
  };

  it("donne le jour et l'heure de Paris", () => {
    expect(slotLabel(at("2026-10-13T07:30:00Z"), "fr")).toBe(
      "mardi 13 octobre à 09:30",
    );
    expect(slotLabel(at("2026-10-13T07:30:00Z"), "en")).toBe(
      "Tuesday 13 October at 09:30",
    );
  });

  it("numérote les créneaux et rappelle que le cabinet confirme", () => {
    const text = appointmentMessage(
      {
        kind: "offer",
        slots: [at("2026-10-13T07:30:00Z"), at("2026-10-13T09:00:00Z")],
      },
      wording,
    );
    expect(text).toContain("1. mardi 13 octobre à 09:30");
    expect(text).toContain("2. mardi 13 octobre à 11:00");
    expect(text).toContain("confirmera ensuite");
    expect(appointmentMessage({ kind: "callback" }, wording)).toContain(
      "vous recontactera",
    );
  });
});
