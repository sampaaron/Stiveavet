import { describe, expect, it } from "vitest";

import type { FollowupView } from "@/domains/suivis/service";

import { applyFollowupFilters, followupFilters } from "./filters";

const base = {
  species: "cat" as const,
  responsibleMembershipId: "m1",
  responsibleName: "Dr Claire Fontaine",
  isPrivate: false,
  isTest: false,
  controlAppointmentAt: null,
  startedAt: null,
};

const views: FollowupView[] = [
  {
    ...base,
    access: "clinical",
    id: "1",
    animalName: "Plume",
    ownerName: "Élodie Girard",
    status: "active",
    procedure: "Stérilisation",
    procedureAt: new Date(),
    triage: "urgent",
    protocol: null,
  },
  {
    ...base,
    access: "summary",
    id: "2",
    animalName: "Gaston",
    ownerName: "Paul Morel",
    status: "ended",
  },
];

const names = (filters: Record<string, string>) =>
  applyFollowupFilters(views, followupFilters.parse(filters)).map(
    (view) => view.animalName,
  );

describe("filtres de la liste des suivis", () => {
  it("cherche sans accents ni majuscules, sur plusieurs mots", () => {
    expect(names({ query: "elodie plume" })).toEqual(["Plume"]);
    expect(names({ query: "sterilisation" })).toEqual(["Plume"]);
    expect(names({ query: "morel" })).toEqual(["Gaston"]);
  });

  it("filtre par statut, « en cours » regroupant actif, pause et reprise", () => {
    expect(names({ status: "ongoing" })).toEqual(["Plume"]);
    expect(names({ status: "ended" })).toEqual(["Gaston"]);
    expect(names({ status: "inconnu" })).toEqual(["Plume", "Gaston"]);
  });

  it("ne filtre la priorité que sur les suivis lisibles au niveau clinique", () => {
    expect(names({ priority: "urgent" })).toEqual(["Plume"]);
    expect(names({ priority: "watch" })).toEqual([]);
  });
});
