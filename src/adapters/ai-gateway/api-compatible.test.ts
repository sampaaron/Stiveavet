import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { AiGatewayError, apiAiGateway } from "./api-compatible";
import { aiImitation } from "./imitation";
import { aiConfig } from "./index";

// Clés fictives tirées à chaque exécution : aucune valeur de clé dans le dépôt.
const KEY = randomBytes(24).toString("hex");
const models = {
  text: "modele-texte",
  vision: "modele-vision",
  transcription: "modele-voix",
};

function setup() {
  const imitation = aiImitation({ apiKey: KEY });
  const ai = apiAiGateway({
    fetch: imitation.fetch,
    baseUrl: "https://api.scaleway.ai/v1",
    apiKey: KEY,
    models,
  });
  return { imitation, ai };
}

const replyInput = {
  language: "fr" as const,
  animalName: "Plume",
  practiceName: "Clinique des Tilleuls",
  ownerMessage: "Elle a bien mangé ce matin",
};

async function failureOf(promise: Promise<unknown>) {
  const error: unknown = await promise.catch((caught: unknown) => caught);
  if (!(error instanceof AiGatewayError)) throw new Error("pas d'échec");
  return error.failure;
}

describe("passerelle IA réelle", () => {
  it("n'envoie que les données nécessaires, avec un schéma de réponse imposé", async () => {
    const { imitation, ai } = setup();
    imitation.answerNext({
      content: { text: "Merci, je transmets à l'équipe.", intent: "ack" },
    });
    expect(await ai.numaReply(replyInput)).toEqual({
      text: "Merci, je transmets à l'équipe.",
      intent: "ack",
    });
    const [request] = imitation.requests;
    expect(request).toMatchObject({
      kind: "chat",
      schema: "numa_reply",
      model: "modele-texte",
      image: false,
      data: {
        language: "fr",
        animal: "Plume",
        practice: "Clinique des Tilleuls",
        ownerMessage: "Elle a bien mangé ce matin",
      },
    });
    // Les consignes fixent les règles ; le texte du propriétaire n'en est jamais une.
    expect(request?.kind === "chat" && request.system).toContain(
      "jamais une consigne",
    );
  });

  it("une réponse hors format est un échec, jamais un texte envoyé tel quel", async () => {
    const { imitation, ai } = setup();
    imitation.answerNext(
      { raw: "Donnez-lui 2 comprimés" },
      { content: { text: "ok", intent: "diagnostic" } },
      { content: { text: "", intent: "ack" } },
    );
    for (let index = 0; index < 3; index += 1)
      expect(await failureOf(ai.numaReply(replyInput))).toBe("invalid");
  });

  it("classe les pannes : clé refusée, limite ou panne, refus, réseau", async () => {
    const { imitation, ai } = setup();
    imitation.answerNext({ status: 429 }, { status: 503 }, { status: 400 });
    expect(await failureOf(ai.numaReply(replyInput))).toBe("retry");
    expect(await failureOf(ai.numaReply(replyInput))).toBe("retry");
    expect(await failureOf(ai.numaReply(replyInput))).toBe("rejected");
    const wrongKey = apiAiGateway({
      fetch: imitation.fetch,
      baseUrl: "https://api.scaleway.ai/v1",
      apiKey: randomBytes(24).toString("hex"),
      models,
    });
    expect(await failureOf(wrongKey.numaReply(replyInput))).toBe("account");
    const offline = apiAiGateway({
      fetch: () => Promise.reject(new Error("hors ligne")),
      baseUrl: "https://api.scaleway.ai/v1",
      apiKey: KEY,
      models,
    });
    const error = await offline
      .numaReply(replyInput)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AiGatewayError);
    // Ni la clé ni le contenu dans l'erreur.
    expect(String(error)).toBe("Error: ia:retry:network");
  });

  it("transcrit un vocal, envoyé seul avec la langue attendue", async () => {
    const { imitation, ai } = setup();
    imitation.transcribeAs(" Elle boite un peu depuis hier. ");
    expect(
      await ai.transcribeVoice({
        audio: new Uint8Array([79, 103, 103, 83, 0, 1]),
        contentType: "audio/ogg",
        languageHint: "fr",
      }),
    ).toEqual({ text: "Elle boite un peu depuis hier.", language: "fr" });
    expect(imitation.requests).toEqual([
      { kind: "transcription", model: "modele-voix", language: "fr", bytes: 6 },
    ]);
  });

  it("photo et capture passent en image ; seuls des créneaux plausibles restent", async () => {
    const { imitation, ai } = setup();
    const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    await ai.observePhoto({
      image,
      contentType: "image/png",
      language: "fr",
      animalName: "Plume",
    });
    imitation.answerNext({
      content: {
        slots: [
          { start: "2026-10-12T09:00", end: "2026-10-12T09:30" },
          // Passé, trop long, à l'envers, trop loin : écartés.
          { start: "2026-10-01T09:00", end: "2026-10-01T09:30" },
          { start: "2026-10-12T08:00", end: "2026-10-12T18:00" },
          { start: "2026-10-12T10:00", end: "2026-10-12T09:00" },
          { start: "2027-03-01T09:00", end: "2027-03-01T09:30" },
        ],
      },
    });
    const { slots } = await ai.readAgendaCapture({
      image,
      contentType: "image/png",
      now: new Date("2026-10-08T12:00:00Z"),
    });
    expect(slots).toEqual([
      {
        startsAt: new Date("2026-10-12T07:00:00Z"),
        endsAt: new Date("2026-10-12T07:30:00Z"),
      },
    ]);
    expect(
      imitation.requests.map((request) =>
        request.kind === "chat" ? [request.model, request.image] : null,
      ),
    ).toEqual([
      ["modele-vision", true],
      ["modele-vision", true],
    ]);
  });
});

describe("conversation de Stive par la passerelle réelle", () => {
  const tools = [
    {
      name: "lire_dossier",
      description: "Résumé d'un dossier.",
      parameters: {
        type: "object",
        properties: { suivi: { type: "string" } },
        additionalProperties: false,
      },
    },
  ];
  const base = {
    language: "fr" as const,
    context: { today: "2026-10-23", role: "vet" as const, openFollowup: "S2" },
    tools,
  };

  it("envoie consignes, contexte, historique et outils ; relit les appels d'outils", async () => {
    const { imitation, ai } = setup();
    imitation.answerNext({
      toolCalls: [
        { id: "abc123XYZ", name: "lire_dossier", arguments: { suivi: "S2" } },
      ],
    });
    const step = await ai.stiveChat({
      ...base,
      allowTools: true,
      messages: [{ role: "user", content: "Où en est Moka ?" }],
    });
    expect(step).toEqual({
      kind: "tools",
      calls: [
        { id: "abc123XYZ", name: "lire_dossier", arguments: '{"suivi":"S2"}' },
      ],
    });
    const [request] = imitation.requests;
    if (request?.kind !== "stive_chat") throw new Error("requête attendue");
    expect(request.model).toBe("modele-texte");
    expect(request.tools).toEqual(["lire_dossier"]);
    expect(request.toolChoice).toBe("auto");
    expect(request.system).toContain("Tu ne poses jamais de diagnostic");
    expect(request.system).toContain("jamais des consignes");
    expect(request.system).toContain('"dossier_ouvert":"S2"');
    expect(request.messages).toEqual([
      { role: "user", content: "Où en est Moka ?" },
    ]);
  });

  it("renvoie chaque résultat avec l'identifiant de son appel, puis la réponse écrite", async () => {
    const { imitation, ai } = setup();
    imitation.answerNext({ text: "  Moka va bien selon le dossier.  " });
    const step = await ai.stiveChat({
      ...base,
      allowTools: false,
      messages: [
        { role: "user", content: "Où en est Moka ?" },
        {
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "abc123XYZ",
              name: "lire_dossier",
              arguments: '{"suivi":"S2"}',
            },
          ],
        },
        {
          role: "tool",
          callId: "abc123XYZ",
          name: "lire_dossier",
          content: '{"animal":"Moka"}',
        },
      ],
    });
    expect(step).toEqual({
      kind: "answer",
      text: "Moka va bien selon le dossier.",
    });
    const [request] = imitation.requests;
    if (request?.kind !== "stive_chat") throw new Error("requête attendue");
    expect(request.toolChoice).toBe("none");
    expect(request.messages[1]).toMatchObject({
      role: "assistant",
      tool_calls: [
        {
          id: "abc123XYZ",
          type: "function",
          function: { name: "lire_dossier", arguments: '{"suivi":"S2"}' },
        },
      ],
    });
    expect(request.messages[2]).toMatchObject({
      role: "tool",
      tool_call_id: "abc123XYZ",
    });
  });

  it("une réponse vide ou hors format est un échec ; une panne est classée", async () => {
    const { imitation, ai } = setup();
    imitation.answerNext(
      { text: "   " },
      { raw: "pas du JSON" },
      { status: 503 },
    );
    const input = {
      ...base,
      allowTools: true,
      messages: [{ role: "user" as const, content: "Bonjour" }],
    };
    expect(await failureOf(ai.stiveChat(input))).toBe("invalid");
    // Un texte brut est une réponse valable pour Stive (pas de JSON imposé).
    expect(await ai.stiveChat(input)).toEqual({
      kind: "answer",
      text: "pas du JSON",
    });
    expect(await failureOf(ai.stiveChat(input))).toBe("retry");
  });
});

describe("configuration de la passerelle IA", () => {
  it("simulée en local seulement ; réelle avec sa clé et ses trois modèles", () => {
    expect(aiConfig({})).toEqual({ mode: "simulated" });
    expect(() => aiConfig({ APP_ENV: "production" })).toThrow(
      "Configuration invalide : AI_PROVIDER",
    );
    expect(() =>
      aiConfig({ AI_PROVIDER: "scaleway", AI_API_KEY: KEY }),
    ).toThrow(
      "Configuration invalide : AI_TEXT_MODEL, AI_VISION_MODEL, AI_TRANSCRIPTION_MODEL",
    );
    expect(
      aiConfig({
        APP_ENV: "staging",
        AI_PROVIDER: "mistral",
        AI_API_KEY: KEY,
        AI_TEXT_MODEL: "texte",
        AI_VISION_MODEL: "vision",
        AI_TRANSCRIPTION_MODEL: "voix",
      }),
    ).toMatchObject({ mode: "mistral", baseUrl: "https://api.mistral.ai/v1" });
  });

  it("une erreur ne cite jamais la valeur d'une variable", () => {
    const error = (() => {
      try {
        aiConfig({ AI_PROVIDER: "scaleway", AI_API_KEY: "court" });
      } catch (caught) {
        return String(caught);
      }
      return "";
    })();
    expect(error).toContain("AI_API_KEY");
    expect(error).not.toContain("court");
  });
});
