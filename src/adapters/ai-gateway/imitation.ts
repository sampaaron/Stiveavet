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

/** Tour de la conversation de Stive (ADR 0042) : messages libres et outils. */
const toolChatRequest = z.object({
  model: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant", "tool"]),
        content: z.string(),
        tool_call_id: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        tool_calls: z
          .array(
            z.object({
              id: z.string().min(1),
              type: z.literal("function"),
              function: z.object({
                name: z.string().min(1),
                arguments: z.string(),
              }),
            }),
          )
          .optional(),
      }),
    )
    .min(2),
  tools: z
    .array(
      z.object({
        type: z.literal("function"),
        function: z.object({
          name: z.string().min(1),
          description: z.string().min(1),
          parameters: z.object({ type: z.literal("object") }).loose(),
        }),
      }),
    )
    .optional(),
  tool_choice: z.enum(["auto", "none"]).optional(),
});

type ToolChatMessage = z.infer<typeof toolChatRequest>["messages"][number];

/**
 * Règle du format : chaque appel d'outil du modèle reçoit son résultat juste après, avec le
 * même identifiant, et aucun résultat n'arrive sans appel.
 */
function toolResultsMatch(messages: readonly ToolChatMessage[]): boolean {
  const pending = new Set<string>();
  for (const message of messages) {
    if (message.role === "tool") {
      if (!message.tool_call_id || !pending.delete(message.tool_call_id))
        return false;
      continue;
    }
    if (pending.size) return false;
    for (const call of message.tool_calls ?? []) pending.add(call.id);
  }
  return pending.size === 0;
}

export type ImitatedAiRequest =
  | {
      kind: "stive_chat";
      model: string;
      system: string;
      /** Messages après la consigne, tels qu'envoyés au fournisseur. */
      messages: ToolChatMessage[];
      tools: string[];
      toolChoice: "auto" | "none" | null;
    }
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

/**
 * Réponse du modèle : un objet (rendu en JSON), un texte brut, une erreur HTTP ; pour Stive,
 * un texte libre ou des appels d'outils.
 */
type Answer =
  | { content: unknown }
  | { raw: string }
  | { status: number }
  | { text: string }
  | { toolCalls: { id?: string; name: string; arguments: unknown }[] };

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

  let callNumber = 0;

  function reply(answer: Answer): Response {
    if ("status" in answer)
      return Response.json(
        { error: { message: "Imitation" } },
        { status: answer.status },
      );
    if ("toolCalls" in answer)
      return Response.json({
        id: "imitation",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: null,
              tool_calls: answer.toolCalls.map((call) => ({
                id: call.id ?? `appel${(callNumber += 1)}`,
                type: "function",
                function: {
                  name: call.name,
                  arguments:
                    typeof call.arguments === "string"
                      ? call.arguments
                      : JSON.stringify(call.arguments),
                },
              })),
            },
          },
        ],
      });
    const content =
      "raw" in answer
        ? answer.raw
        : "text" in answer
          ? answer.text
          : JSON.stringify(answer.content);
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
    const body: unknown = JSON.parse(
      typeof init.body === "string" ? init.body : "null",
    );
    if (typeof body === "object" && body && !("response_format" in body)) {
      const chat = toolChatRequest.safeParse(body);
      if (!chat.success || !toolResultsMatch(chat.data.messages))
        return Response.json({ error: {} }, { status: 400 });
      const [system, ...rest] = chat.data.messages;
      if (system?.role !== "system")
        return Response.json({ error: {} }, { status: 400 });
      requests.push({
        kind: "stive_chat",
        model: chat.data.model,
        system: system.content,
        messages: rest,
        tools: (chat.data.tools ?? []).map((tool) => tool.function.name),
        toolChoice: chat.data.tool_choice ?? null,
      });
      return reply(
        queued.shift() ?? {
          text: "Je suis Stive, l'assistant IA de l'équipe.",
        },
      );
    }
    const parsed = chatRequest.safeParse(body);
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
