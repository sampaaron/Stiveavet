import { describe, expect, it } from "vitest";

import { simulatedSynthesis } from "@/adapters/ai-gateway/simulated-synthesis";
import type { SynthesisEvent } from "@/adapters/ai-gateway/types";

import { checkSynthesisLine, guardDraft } from "./synthese-garde";

const at = (hours: number) => new Date(Date.UTC(2026, 9, 7, hours, 0));

const events: SynthesisEvent[] = [
  {
    at: at(16),
    from: "numa",
    text: "Comment va Caramel depuis son retour ? Est-elle réveillée ?",
    media: null,
    triage: null,
  },
  {
    at: at(16.2),
    from: "owner",
    text: "Elle est un peu groggy mais elle marche.",
    media: null,
    triage: "normal",
  },
  {
    at: at(19),
    from: "owner",
    text: "Il y a du sang sur la plaie depuis ce soir.",
    media: "photo",
    triage: "urgent",
  },
  {
    at: at(19.1),
    from: "owner",
    text: "Elle se lèche beaucoup, est-ce normal ?",
    media: "voice",
    triage: "watch",
  },
  {
    at: at(19.2),
    from: "numa",
    text: "Pourriez-vous m'envoyer une photo du pansement demain ?",
    media: null,
    triage: null,
  },
];

describe("synthèse simulée", () => {
  const draft = simulatedSynthesis({
    language: "fr",
    procedure: "Ovariectomie",
    dayNumber: 1,
    events,
  });

  it("cite le propriétaire mot pour mot et range selon le triage", () => {
    expect(draft.positives).toEqual([
      "« Elle est un peu groggy mais elle marche. »",
    ]);
    expect(draft.negatives).toEqual([
      "« Il y a du sang sur la plaie depuis ce soir. » (photo)",
      "« Elle se lèche beaucoup, est-ce normal ? » (vocal)",
    ]);
  });

  it("résume l'évolution sans juger la gravité", () => {
    expect(draft.evolution).toContain("Jour 1 du suivi (Ovariectomie).");
    expect(draft.evolution).toContain(
      "3 nouvelles du propriétaire, dont 2 signalées à surveiller ou urgentes.",
    );
    expect(draft.evolution).toContain(
      "« Elle se lèche beaucoup, est-ce normal ? » (vocal)",
    );
  });

  it("relève les questions du propriétaire et la dernière question restée sans réponse", () => {
    expect(draft.openQuestions).toEqual([
      "Question du propriétaire : « Elle se lèche beaucoup, est-ce normal ? »",
      "Sans réponse du propriétaire : « Pourriez-vous m'envoyer une photo du pansement demain ? »",
    ]);
  });

  it("passe ses propres garde-fous", () => {
    const { content, reasons } = guardDraft(
      draft,
      events.map((event) => event.text),
      "fr",
    );
    expect(reasons).toEqual([]);
    expect(content.withheld).toBe(0);
  });

  it("ne prend ni une demande de rendez-vous ni un choix de créneau pour un signal", () => {
    const logistics = simulatedSynthesis({
      language: "fr",
      procedure: "Ovariectomie",
      dayNumber: 1,
      events: [
        {
          at: at(18),
          from: "owner",
          text: "Peut-on prendre rendez-vous pour le contrôle ?",
          media: null,
          triage: "normal",
        },
        { at: at(19), from: "owner", text: "2", media: null, triage: "normal" },
      ],
    });
    expect(logistics.positives).toEqual([]);
    expect(logistics.openQuestions).toEqual([]);
  });

  it("sans nouvelles, le dit simplement ; en anglais aussi", () => {
    expect(
      simulatedSynthesis({
        language: "en",
        procedure: "Spay",
        dayNumber: 0,
        events: [],
      }),
    ).toEqual({
      evolution: "Day 0 of follow-up (Spay). No news from the owner yet.",
      positives: [],
      negatives: [],
      openQuestions: [],
    });
  });
});

describe("garde-fous de la synthèse", () => {
  const sources = ["Elle a vomi deux fois ce matin.", "Elle boit normalement"];

  it("accepte une citation exacte, même si le propriétaire parle de dose ou d'inquiétude", () => {
    expect(
      checkSynthesisLine("« Elle a vomi deux fois ce matin. »", sources),
    ).toEqual({ ok: true });
    expect(
      checkSynthesisLine("“Elle boit normalement”", ["Elle boit normalement"]),
    ).toEqual({ ok: true });
  });

  it("refuse une citation inventée ou retouchée", () => {
    expect(checkSynthesisLine("« Elle a vomi trois fois »", sources)).toEqual({
      ok: false,
      reason: "unfaithful_quote",
    });
  });

  it("refuse diagnostic, dosage, prescription et réassurance hors citation", () => {
    expect(
      checkSynthesisLine("C'est probablement une infection.", sources),
    ).toMatchObject({ ok: false, reason: "diagnosis" });
    expect(
      checkSynthesisLine("Prévoir 2 comprimés ce soir.", sources),
    ).toMatchObject({ ok: false, reason: "dosage" });
    expect(
      checkSynthesisLine("« Elle boit normalement » : rien de grave.", sources),
    ).toMatchObject({ ok: false, reason: "reassurance" });
  });

  it("écarte les lignes refusées, les compte et remplace une évolution refusée", () => {
    const { content, reasons } = guardDraft(
      {
        evolution: "Tout va bien, c'est normal après une opération.",
        positives: ["« Elle boit normalement »", "« Elle mange bien »"],
        negatives: ["Il s'agit d'une infection de la plaie."],
        openQuestions: [],
      },
      sources,
      "fr",
    );
    expect(content).toEqual({
      evolution:
        "Synthèse indisponible pour cette partie : lisez la conversation.",
      positives: ["« Elle boit normalement »"],
      negatives: [],
      openQuestions: [],
      withheld: 3,
    });
    expect(reasons).toEqual(["reassurance", "unfaithful_quote", "diagnosis"]);
  });
});
