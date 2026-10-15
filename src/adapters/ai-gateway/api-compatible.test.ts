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
      fetch: (() => Promise.reject(new Error("hors ligne"))) as typeof fetch,
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
