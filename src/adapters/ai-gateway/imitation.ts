import { z } from "zod";

/**
 * Imitation locale d'un fournisseur d'IA à l'API « chat completions » (lot 23), pour les
 * tests seulement : aucun appel réseau, aucun compte. Elle vérifie la clé et la forme des
 * requêtes, garde chacune pour que les tests contrôlent ce qui part, et répond ce que le test
 * lui demande, y compris le pire : réponse dangereuse, hors format, ou panne.
 */

const chatRequest = z.object({
  model: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user"]),
        content: z.union([
          z.string(),
          z.array(
            z.union([
              z.object({ type: z.literal("text"), text: z.string() }),
              z.object({
                type: z.literal("image_url"),
                image_url: z.object({
                  url: z.string().startsWith("data:image/"),
                }),
              }),
            ]),
          ),
        ]),
      }),
    )
    .length(2),
  response_format: z.object({
    type: z.literal("json_schema"),
    json_schema: z.object({
      name: z.string(),
      strict: z.literal(true),
      schema: z.object({ type: z.literal("object") }).loose(),
    }),
  }),
});

export type ImitatedAiRequest =
  | {
      kind: "chat";
      schema: string;
      model: string;
      system: string;
      /** Données transmises au modèle, relues depuis le JSON envoyé. */
      data: unknown;
      image: boolean;
    }
  | { kind: "transcription"; model: string; language: string; bytes: number };

/** Réponse du modèle : un objet (rendu en JSON), un texte brut, ou une erreur HTTP. */
type Answer = { content: unknown } | { raw: string } | { status: number };

const DEFAULTS: Record<string, unknown> = {
  numa_reply: {
    text: "Merci pour ces nouvelles, je les transmets à l'équipe du cabinet.",
    intent: "ack",
  },
  numa_step: { text: "Bonjour, comment va votre animal aujourd'hui ?" },
  photo_observations: { observations: ["Pansement visible et propre."] },
  agenda_slots: { slots: [] },
  followup_synthesis: {
    evolution: "Le propriétaire donne des nouvelles régulières.",
    positives: [],
    negatives: [],
    openQuestions: [],
  },
};

export function aiImitation(options: { apiKey: string }) {
  const requests: ImitatedAiRequest[] = [];
  const queued: Answer[] = [];
  let transcript = "Transcription fictive du message vocal.";

  function reply(answer: Answer): Response {
    if ("status" in answer)
      return Response.json(
        { error: { message: "Imitation" } },
        { status: answer.status },
      );
    const content =
      "raw" in answer ? answer.raw : JSON.stringify(answer.content);
    return Response.json({
      id: "imitation",
      choices: [{ index: 0, message: { role: "assistant", content } }],
    });
  }

  async function handle(url: URL, init: RequestInit): Promise<Response> {
    const auth = new Headers(init.headers).get("authorization");
    if (auth !== `Bearer ${options.apiKey}`)
      return Response.json({ error: {} }, { status: 401 });
    if (init.method !== "POST") return new Response(null, { status: 405 });
    const path = url.pathname.replace(/^\/v1\//, "");
    if (path === "audio/transcriptions") {
      if (!(init.body instanceof FormData))
        return new Response(null, { status: 400 });
      const file = init.body.get("file");
      if (!(file instanceof Blob)) return new Response(null, { status: 400 });
      requests.push({
        kind: "transcription",
        model: String(init.body.get("model")),
        language: String(init.body.get("language")),
        bytes: file.size,
      });
      const answer = queued.shift();
      if (answer && "status" in answer) return reply(answer);
      return Response.json({ text: transcript });
    }
    if (path !== "chat/completions") return new Response(null, { status: 404 });
    const parsed = chatRequest.safeParse(
      JSON.parse(typeof init.body === "string" ? init.body : "null"),
    );
    if (!parsed.success) return Response.json({ error: {} }, { status: 400 });
    const [system, user] = parsed.data.messages;
    const parts =
      typeof user?.content === "string"
        ? [{ type: "text" as const, text: user.content }]
        : (user?.content ?? []);
    const text = parts.find((part) => part.type === "text");
    const schema = parsed.data.response_format.json_schema.name;
    requests.push({
      kind: "chat",
      schema,
      model: parsed.data.model,
      system: typeof system?.content === "string" ? system.content : "",
      data: JSON.parse(text && "text" in text ? text.text : "null"),
      image: parts.some((part) => part.type === "image_url"),
    });
    return reply(queued.shift() ?? { content: DEFAULTS[schema] ?? {} });
  }

  return {
    requests,
    /** `fetch` à passer à la passerelle réelle. */
    fetch: (async (input: string | URL | Request, init: RequestInit = {}) =>
      handle(
        new URL(input instanceof Request ? input.url : input),
        init,
      )) as typeof fetch,
    /** Prochaines réponses du modèle, dans l'ordre. */
    answerNext(...answers: Answer[]) {
      queued.push(...answers);
    },
    /** Texte des prochaines transcriptions. */
    transcribeAs(text: string) {
      transcript = text;
    },
  };
}
