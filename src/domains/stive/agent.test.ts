import { describe, expect, it } from "vitest";

import { fakeAiGateway } from "@/adapters/ai-gateway/fake";
import type {
  AiGateway,
  StiveChatInput,
  StiveChatStep,
} from "@/adapters/ai-gateway/types";

import {
  HISTORY_MESSAGES,
  StiveTurnError,
  TURN_LIMITS,
  chatMessages,
  runStiveTurn,
} from "./agent";
import type { HistoryEntry } from "./agent";
import { recognizeSmallTalk } from "./bavardage";

/** Passerelle factice qui joue un script et garde chaque appel. */
function scripted(...steps: StiveChatStep[]) {
  const calls: StiveChatInput[] = [];
  const ai: AiGateway = {
    ...fakeAiGateway,
    simulated: false,
    async stiveChat(input) {
      calls.push({ ...input, messages: [...input.messages] });
      const step = steps.shift();
      if (!step) throw new Error("script épuisé");
      return step;
    },
  };
  return { ai, calls };
}

const context = {
  today: "2026-10-23",
  role: "vet" as const,
  openFollowup: null,
};

describe("historique envoyé au modèle", () => {
  it("borne l'historique, décrit les cartes en une ligne et ne transmet aucune réponse masquée", () => {
    const history: HistoryEntry[] = [
      { author: "member", question: "Résumé de Moka" },
      {
        author: "stive",
        answer: {
          kind: "summary",
          followup: {
            id: "11111111-1111-4111-8111-111111111111",
            animalName: "Moka",
            procedure: "Ovariectomie",
            dayNumber: 3,
            status: "active",
          },
          synthesis: {
            evolution: "« Elle a vomi » selon la propriétaire.",
            positives: [],
            negatives: [],
            openQuestions: [],
            withheld: 0,
          },
          exchanges: { ownerMessages: 2, photos: 0, voiceNotes: 0 },
          openAlerts: 0,
        },
      },
      { author: "member", question: "Et Filou ?" },
      { author: "stive", answer: null },
      { author: "member", question: "Comment rassurer un propriétaire ?" },
      {
        author: "stive",
        answer: {
          kind: "reply",
          text: "Expliquez simplement ce qui est prévu.",
          withheld: null,
          sources: { followups: [], agenda: false },
        },
      },
      {
        author: "stive",
        answer: {
          kind: "reply",
          text: null,
          withheld: "dosage",
          sources: { followups: [], agenda: false },
        },
      },
    ];
    expect(chatMessages(history, "Merci, et pour Ruby ?")).toEqual([
      { role: "user", content: "Résumé de Moka" },
      {
        role: "assistant",
        content: "[Carte affichée : résumé du dossier de Moka]",
      },
      { role: "user", content: "Et Filou ?" },
      {
        role: "assistant",
        content: "[Réponse masquée : dossier devenu inaccessible]",
      },
      { role: "user", content: "Comment rassurer un propriétaire ?" },
      {
        role: "assistant",
        content:
          "Expliquez simplement ce qui est prévu.\n[Réponse écartée par le contrôle de sécurité]",
      },
      { role: "user", content: "Merci, et pour Ruby ?" },
    ]);
    // Rien de la synthèse (propos du propriétaire) ne repart dans l'historique.
    expect(JSON.stringify(chatMessages(history, "?"))).not.toContain("vomi");

    const long: HistoryEntry[] = Array.from({ length: 40 }, (_, index) =>
      index % 2
        ? {
            author: "stive",
            answer: {
              kind: "reply",
              text: `réponse ${index}`,
              withheld: null,
              sources: { followups: [], agenda: false },
            },
          }
        : { author: "member", question: `question ${index}` },
    );
    const messages = chatMessages(long, "dernière");
    expect(messages).toHaveLength(HISTORY_MESSAGES + 1);
    expect(messages[0]).toEqual({ role: "user", content: "question 28" });
    expect(messages.at(-1)).toEqual({ role: "user", content: "dernière" });
  });
});

describe("boucle d'outils de Stive", () => {
  it("exécute les outils demandés puis rend la réponse écrite", async () => {
    const { ai, calls } = scripted(
      {
        kind: "tools",
        calls: [
          { id: "a1", name: "chercher_suivis", arguments: '{"animal":"Moka"}' },
        ],
      },
      {
        kind: "tools",
        calls: [
          { id: "a2", name: "lire_dossier", arguments: '{"suivi":"S1"}' },
        ],
      },
      { kind: "answer", text: "Moka va bien selon le dossier." },
    );
    const executed: string[] = [];
    const turn = await runStiveTurn({
      ai,
      language: "fr",
      context,
      messages: [{ role: "user", content: "Comment va Moka ?" }],
      execute: async (call) => {
        executed.push(call.name);
        return { ok: call.name };
      },
    });
    expect(turn).toEqual({
      text: "Moka va bien selon le dossier.",
      toolCalls: 2,
    });
    expect(executed).toEqual(["chercher_suivis", "lire_dossier"]);
    // Chaque résultat suit son appel, avec le même identifiant.
    expect(calls[2]?.messages.slice(1)).toEqual([
      {
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "a1", name: "chercher_suivis", arguments: '{"animal":"Moka"}' },
        ],
      },
      {
        role: "tool",
        callId: "a1",
        name: "chercher_suivis",
        content: '{"ok":"chercher_suivis"}',
      },
      {
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "a2", name: "lire_dossier", arguments: '{"suivi":"S1"}' },
        ],
      },
      {
        role: "tool",
        callId: "a2",
        name: "lire_dossier",
        content: '{"ok":"lire_dossier"}',
      },
    ]);
    expect(calls.map((call) => call.allowTools)).toEqual([true, true, true]);
  });

  it("limite les appels d'outils : au-delà, un refus ; le dernier tour exige un texte", async () => {
    const many = Array.from({ length: 8 }, (_, index) => ({
      id: `c${index}`,
      name: "point_du_jour",
      arguments: "{}",
    }));
    const { ai, calls } = scripted(
      { kind: "tools", calls: many },
      { kind: "answer", text: "Voici l'essentiel." },
    );
    let executed = 0;
    await runStiveTurn({
      ai,
      language: "fr",
      context,
      messages: [{ role: "user", content: "Tout !" }],
      execute: async () => {
        executed += 1;
        return {};
      },
    });
    expect(executed).toBe(TURN_LIMITS.toolCalls);
    const results = calls[1]?.messages.filter((m) => m.role === "tool") ?? [];
    expect(results).toHaveLength(8);
    expect(results.at(-1)?.content).toContain("Limite d'outils atteinte");
    // Plus aucun outil permis une fois la limite atteinte.
    expect(calls[1]?.allowTools).toBe(false);

    const looping = scripted(
      ...Array.from({ length: TURN_LIMITS.rounds }, (_, index) => ({
        kind: "tools" as const,
        calls: [{ id: `l${index}`, name: "point_du_jour", arguments: "{}" }],
      })),
    );
    await expect(
      runStiveTurn({
        ai: looping.ai,
        language: "fr",
        context,
        messages: [{ role: "user", content: "?" }],
        execute: async () => ({}),
      }),
    ).rejects.toBeInstanceOf(StiveTurnError);
    expect(looping.calls.map((call) => call.allowTools)).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it("s'arrête au délai d'un tour", async () => {
    let time = 0;
    const { ai } = scripted({
      kind: "tools",
      calls: [{ id: "t1", name: "point_du_jour", arguments: "{}" }],
    });
    await expect(
      runStiveTurn({
        ai,
        language: "fr",
        context,
        messages: [{ role: "user", content: "?" }],
        execute: async () => {
          time += TURN_LIMITS.durationMs + 1;
          return {};
        },
        clock: () => time,
      }),
    ).rejects.toMatchObject({ code: "deadline" });
  });
});

describe("échanges simples du mode simulé", () => {
  it.each([
    ["Bonjour", "greeting"],
    ["Salut Stive !", "greeting"],
    ["Hello", "greeting"],
    ["Merci beaucoup", "thanks"],
    ["Qui es-tu ?", "identity"],
    ["Tu es une IA ?", "identity"],
    ["Que sais-tu faire ?", "help"],
    ["What can you do?", "help"],
  ] as const)("« %s » : %s", (question, topic) => {
    expect(recognizeSmallTalk(question)).toBe(topic);
  });

  it.each([
    "Bonjour, quelle dose de méloxicam pour un chat de 4 kg ?",
    "Comment annoncer une complication à un propriétaire ?",
    "Merci de me dire comment gérer un client agressif au téléphone",
  ])("une vraie question n'est pas un échange simple : « %s »", (question) => {
    expect(recognizeSmallTalk(question)).toBe(null);
  });
});
