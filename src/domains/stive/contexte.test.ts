import { describe, expect, it } from "vitest";

import type { FollowupRecord } from "@/domains/suivis/record";
import type {
  FollowupClinical,
  FollowupSummary,
} from "@/domains/suivis/service";

import {
  buildStiveCase,
  conversationTitle,
  detectFollowup,
  maskContactData,
  stiveFollowupChoice,
  stiveMessageInput,
} from "./contexte";
import type { StiveCandidate } from "./contexte";

const NOW = new Date("2026-10-23T10:00:00Z");

const summary: FollowupSummary = {
  access: "summary",
  id: "0d3f1e9a-5a3c-4b8e-9b55-6b7f2f1e0a01",
  animalName: "Plume",
  species: "cat",
  ownerName: "Chloé Mercier",
  status: "active",
  responsibleMembershipId: "0d3f1e9a-5a3c-4b8e-9b55-6b7f2f1e0a99",
  responsibleName: "Dr Claire Fontaine",
  isPrivate: false,
  isTest: false,
  controlAppointmentAt: null,
  startedAt: new Date("2026-10-20T08:00:00Z"),
};

const clinical: FollowupClinical = {
  ...summary,
  access: "clinical",
  procedure: "Ovariectomie",
  procedureAt: new Date("2026-10-20T08:00:00Z"),
  triage: "watch",
  protocol: null,
};

const record: FollowupRecord = {
  access: "clinical",
  contacts: [
    {
      id: "c1",
      name: "Chloé Mercier",
      phoneEnding: "78",
      role: "primary",
      active: true,
      language: "fr",
      languageSource: "import",
      leftGroup: false,
      consent: "given",
    },
  ],
  messages: [
    {
      id: "m1",
      author: "numa",
      authorName: null,
      body: "Bonjour, comment va Plume ?",
      occurredAt: new Date("2026-10-21T09:00:00Z"),
      delivery: "read",
      attachments: [],
    },
    {
      id: "m2",
      author: "owner",
      authorName: "Chloé Mercier",
      body: "Elle lèche sa plaie, rappelez-moi au 06 12 34 56 78 ou chloe.mercier@example.test",
      occurredAt: new Date("2026-10-22T18:00:00Z"),
      delivery: null,
      attachments: [],
    },
    {
      id: "m3",
      author: "system",
      authorName: null,
      body: "Suivi lancé",
      occurredAt: new Date("2026-10-22T18:01:00Z"),
      delivery: null,
      attachments: [],
    },
  ],
  triage: [],
  alerts: [
    {
      id: "a1",
      level: "watch",
      status: "open",
      targetName: "Dr Claire Fontaine",
      createdAt: new Date("2026-10-22T18:00:00Z"),
      escalateAt: null,
      acknowledgedBy: [],
    },
  ],
  facts: {
    animal: { breed: "Européen", birthDate: "2024-04-23", weightGrams: 3650 },
    treatments: [
      {
        id: "t1",
        source: "drveto",
        name: "Méloxicam",
        instructions: "Une fois par jour pendant 3 jours",
        validatedBy: "Dr Claire Fontaine",
      },
    ],
    imported: { allergies: ["Pénicilline"], antecedents: [] },
  },
};

describe("contexte de Stive", () => {
  it("valide le message et le choix du dossier", () => {
    expect(stiveMessageInput.safeParse("  Bonjour  ").data).toBe("Bonjour");
    expect(stiveMessageInput.safeParse("   ").success).toBe(false);
    expect(stiveMessageInput.safeParse("x".repeat(2001)).success).toBe(false);
    expect(stiveFollowupChoice.safeParse("auto").success).toBe(true);
    expect(stiveFollowupChoice.safeParse("none").success).toBe(true);
    expect(stiveFollowupChoice.safeParse(summary.id).success).toBe(true);
    expect(stiveFollowupChoice.safeParse("' OR 1=1").success).toBe(false);
  });

  it("masque numéros et adresses e-mail, sans toucher aux dates ni aux doses", () => {
    expect(
      maskContactData(
        "Appelez le +33 6 12 34 56 78 ou a.b@exemple.fr, contrôle le 2026-10-30, 0,5 ml",
      ),
    ).toBe("Appelez le […] ou […], contrôle le 2026-10-30, 0,5 ml");
  });

  describe("détection du dossier évoqué", () => {
    const candidates: StiveCandidate[] = [
      summary,
      {
        id: "0d3f1e9a-5a3c-4b8e-9b55-6b7f2f1e0a02",
        animalName: "Rex",
        ownerName: "Antoine Durand",
        status: "active",
        startedAt: new Date("2026-10-18T08:00:00Z"),
      },
    ];

    it("reconnaît le prénom de l'animal, sans tenir compte des accents ni de la casse", () => {
      expect(
        detectFollowup("Comment va PLUME aujourd'hui ?", candidates),
      ).toEqual({ kind: "one", followupId: summary.id });
    });

    it("reconnaît le nom de famille du propriétaire", () => {
      expect(detectFollowup("Le chien des Durand boite", candidates)).toEqual({
        kind: "one",
        followupId: "0d3f1e9a-5a3c-4b8e-9b55-6b7f2f1e0a02",
      });
    });

    it("ne prend pas un prénom au milieu d'un mot", () => {
      expect(detectFollowup("Un rexamen est prévu", candidates)).toEqual({
        kind: "none",
      });
    });

    it("refuse de choisir entre deux animaux cités", () => {
      expect(detectFollowup("Plume et Rex vont bien ?", candidates)).toEqual({
        kind: "ambiguous",
        animalNames: ["Plume", "Rex"],
      });
    });

    it("prend le suivi le plus actuel d'un même animal", () => {
      const older = {
        ...summary,
        id: "0d3f1e9a-5a3c-4b8e-9b55-6b7f2f1e0a03",
        status: "ended" as const,
      };
      expect(detectFollowup("Plume ?", [older, summary])).toEqual({
        kind: "one",
        followupId: summary.id,
      });
    });
  });

  describe("dossier transmis", () => {
    it("sans accès clinique, seulement le prénom, l'espèce et le statut", () => {
      expect(
        buildStiveCase(summary, { access: "summary", contacts: [] }, NOW),
      ).toEqual({
        animal: "Plume",
        species: "cat",
        status: "active",
        clinical: null,
      });
    });

    it("avec l'accès clinique, le strict utile, sans nom, numéro ni e-mail", () => {
      const file = buildStiveCase(clinical, record, NOW);
      expect(file.clinical).toMatchObject({
        procedure: "Ovariectomie",
        dayNumber: 3,
        triage: "watch",
        breed: "Européen",
        ageYears: 2.5,
        weightKg: 3.7,
        treatments: [
          {
            name: "Méloxicam",
            instructions: "Une fois par jour pendant 3 jours",
            validated: true,
          },
        ],
        allergies: ["Pénicilline"],
        openAlerts: [{ level: "watch", status: "open" }],
      });
      expect(file.clinical?.recentExchanges).toEqual([
        {
          dayNumber: 1,
          from: "numa",
          text: "Bonjour, comment va Plume ?",
          media: null,
        },
        {
          dayNumber: 2,
          from: "owner",
          text: "Elle lèche sa plaie, rappelez-moi au […] ou […]",
          media: null,
        },
      ]);
      const sent = JSON.stringify(file);
      expect(sent).not.toContain("Mercier");
      expect(sent).not.toContain("Fontaine");
      expect(sent).not.toContain("06 12");
      expect(sent).not.toContain(summary.id);
    });
  });

  it("titre une conversation par le début du premier message", () => {
    expect(conversationTitle("  Bonjour\nStive  ")).toBe("Bonjour Stive");
    expect(conversationTitle("a".repeat(200))).toHaveLength(80);
  });
});
