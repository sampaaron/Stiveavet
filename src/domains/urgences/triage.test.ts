import { describe, expect, it } from "vitest";

import {
  assessOwnerMessage,
  emergencyPeriod,
  escalationTime,
  firstRecipient,
  frenchHolidays,
  higherLevel,
  matchesRule,
} from "./triage";
import type { FollowupAlertRule } from "./triage";

const RULES: FollowupAlertRule[] = [
  { id: "r1", level: "urgent", description: "Saignement qui ne s'arrête pas" },
  { id: "r2", level: "watch", description: "Refuse de manger plus de 24 h" },
  { id: "r3", level: "watch", description: "Plaie rouge ou gonflée" },
  { id: "r4", level: "urgent", description: "Abattement" },
];

describe("triage déterministe", () => {
  it("reconnaît un signe d'alerte du suivi, avec son niveau", () => {
    expect(
      assessOwnerMessage("Elle saigne encore et ça ne s'arrête pas", RULES),
    ).toMatchObject({ level: "urgent", ruleId: "r1" });
    expect(
      assessOwnerMessage("Il refuse toujours de manger ce matin", RULES),
    ).toMatchObject({ level: "watch", ruleId: "r2", code: "rule" });
    expect(
      assessOwnerMessage("Grosse abattement depuis hier", RULES),
    ).toMatchObject({ level: "urgent", ruleId: "r4" });
  });

  it("le signe le plus grave l'emporte", () => {
    expect(
      assessOwnerMessage(
        "La plaie est rouge et le saignement ne s'arrête pas",
        RULES,
      ),
    ).toMatchObject({ level: "urgent", ruleId: "r1" });
  });

  it("un signal d'urgence universel est urgent, même sans signe d'alerte", () => {
    for (const message of [
      "Il respire mal depuis une heure",
      "Elle a fait une convulsion",
      "Les points sont lâchés",
      "She collapsed in the garden",
    ])
      expect(assessOwnerMessage(message, [])).toMatchObject({
        level: "urgent",
        ruleId: null,
        code: "red_flag",
      });
  });

  it("en cas de doute, escalade : une inquiétude sans signe reconnu est à surveiller", () => {
    for (const message of [
      "Elle a un peu vomi",
      "Est-ce grave s'il se lèche beaucoup ?",
      "I'm worried, he is limping",
    ])
      expect(assessOwnerMessage(message, [])).toMatchObject({
        level: "watch",
        code: "concern",
      });
  });

  it("un message rassurant reste normal", () => {
    expect(
      assessOwnerMessage("Il a bien mangé et il dort tranquillement", RULES),
    ).toEqual({
      level: "normal",
      ruleId: null,
      reason: "Aucun signe d'alerte.",
      code: "none",
    });
  });

  it("un signe d'alerte demande au moins deux mots significatifs, ou le seul qu'il a", () => {
    expect(matchesRule("Il ne s'arrête pas de jouer", RULES[0]!)).toBe(false);
    expect(matchesRule("Un peu d'abattement", RULES[3]!)).toBe(true);
    expect(
      matchesRule("à", { id: "x", level: "watch", description: "Le, la" }),
    ).toBe(false);
  });

  it("compare les niveaux", () => {
    expect(higherLevel("watch", "urgent")).toBe("urgent");
    expect(higherLevel("urgent", "normal")).toBe("urgent");
    expect(higherLevel("normal", "normal")).toBe("normal");
  });
});

describe("périodes des consignes d'urgence (heure de Paris)", () => {
  const windows = [1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    startsAt: "08:00",
    endsAt: "20:00",
  }));

  it("jours fériés de France, Pâques compris", () => {
    const holidays = frenchHolidays(2026);
    for (const day of [
      "2026-01-01",
      "2026-04-06",
      "2026-05-14",
      "2026-05-25",
      "2026-07-14",
      "2026-12-25",
    ])
      expect(holidays.has(day)).toBe(true);
    expect(holidays.size).toBe(11);
    expect(frenchHolidays(2027).has("2027-03-29")).toBe(true);
  });

  it("jour, nuit, week-end et férié, changement d'heure compris", () => {
    // Mercredi 7 octobre 2026, 14 h à Paris (12 h UTC, heure d'été).
    expect(emergencyPeriod(new Date("2026-10-07T12:00:00Z"), windows)).toBe(
      "day",
    );
    // 21 h 30 à Paris : nuit.
    expect(emergencyPeriod(new Date("2026-10-07T19:30:00Z"), windows)).toBe(
      "night",
    );
    // Dimanche 11 octobre, midi : week-end.
    expect(emergencyPeriod(new Date("2026-10-11T10:00:00Z"), windows)).toBe(
      "weekend",
    );
    // Samedi 10 octobre, 22 h : week-end (cabinet fermé).
    expect(emergencyPeriod(new Date("2026-10-10T20:00:00Z"), windows)).toBe(
      "weekend",
    );
    // Mercredi 11 novembre (férié), 10 h.
    expect(emergencyPeriod(new Date("2026-11-11T09:00:00Z"), windows)).toBe(
      "holiday",
    );
    // Lundi 26 octobre, 7 h 30 à Paris (6 h 30 UTC, heure d'hiver) : nuit.
    expect(emergencyPeriod(new Date("2026-10-26T06:30:00Z"), windows)).toBe(
      "night",
    );
    // 8 h 30 à Paris le même jour : jour.
    expect(emergencyPeriod(new Date("2026-10-26T07:30:00Z"), [])).toBe("day");
  });
});

describe("escalade et destinataire", () => {
  it("l'escalade part après le délai réglé, toujours entre 3 et 5 heures", () => {
    const at = new Date("2026-10-07T12:00:00Z");
    expect(escalationTime(at, 240)).toEqual(new Date("2026-10-07T16:00:00Z"));
    expect(escalationTime(at, 60)).toEqual(new Date("2026-10-07T15:00:00Z"));
    expect(escalationTime(at, 900)).toEqual(new Date("2026-10-07T17:00:00Z"));
  });

  it("le responsable aux heures du cabinet, la garde en dehors", () => {
    const base = {
      responsible: { membershipId: "resp", active: true },
      onCallMembershipId: "garde",
      fallbackAdminMembershipId: "admin",
    };
    expect(firstRecipient({ ...base, period: "day" })).toBe("resp");
    expect(firstRecipient({ ...base, period: "night" })).toBe("garde");
    expect(
      firstRecipient({ ...base, period: "weekend", onCallMembershipId: null }),
    ).toBe("resp");
    expect(
      firstRecipient({
        ...base,
        period: "day",
        responsible: { membershipId: "resp", active: false },
      }),
    ).toBe("garde");
    expect(
      firstRecipient({
        ...base,
        period: "day",
        onCallMembershipId: null,
        responsible: { membershipId: "resp", active: false },
      }),
    ).toBe("admin");
  });
});
