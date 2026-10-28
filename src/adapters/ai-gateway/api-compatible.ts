import { z } from "zod";

import { parisLocalToDate } from "@/domains/heure-paris";

import {
  AGENDA_CAPTURE,
  NUMA_REPLY,
  NUMA_STEP,
  PHOTO_OBSERVATIONS,
  STIVE_CHAT,
  SYNTHESIS,
} from "./consignes";
import type { AiGateway, FreeSlot, StiveChatInput } from "./types";

/**
 * Passerelle IA réelle (lot 23, ADR 0026), pour un fournisseur européen qui expose l'API
 * « chat completions » et « audio/transcriptions » devenue standard (Scaleway Generative
 * APIs, Mistral AI). Réponses en JSON imposé par un schéma, relues par Zod : une réponse hors
 * format est un échec, jamais un texte envoyé tel quel. Rien n'est journalisé ; une erreur ne
 * porte que sa classe et un code technique.
 */

export type AiFailure = "retry" | "account" | "rejected" | "invalid";

export class AiGatewayError extends Error {
  constructor(
    readonly failure: AiFailure,
    readonly code: string,
  ) {
    super(`ia:${failure}:${code}`);
  }
}

export type ApiGatewayOptions = {
  fetch: typeof fetch;
  baseUrl: string;
  apiKey: string;
  models: { text: string; vision: string; transcription: string };
  timeoutMs?: number;
};

const chatResponse = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string() }) }))
    .min(1),
});

const numaReply = z.object({
  text: z.string().min(1).max(2000),
  intent: z.enum(["ack", "concern", "refer_treatment", "refer_question"]),
});
const numaStep = z.object({ text: z.string().min(1).max(2000) });
const observations = z.object({
  observations: z.array(z.string().min(1).max(300)).max(6),
});
const localTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const agenda = z.object({
  slots: z.array(z.object({ start: localTime, end: localTime })).max(40),
});
const lines = z.array(z.string().min(1).max(1200)).max(10);
const synthesis = z.object({
  evolution: z.string().min(1).max(1200),
  positives: lines,
  negatives: lines,
  openQuestions: lines,
});
const transcription = z.object({ text: z.string().max(10_000) });

/** Réponse d'un tour de Stive : un texte, ou des appels d'outils (format OpenAI/Mistral). */
const toolChatResponse = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().max(20_000).nullish(),
          tool_calls: z
            .array(
              z.object({
                id: z.string().min(1).max(64),
                function: z.object({
                  name: z.string().min(1).max(64),
                  // Mistral renvoie une chaîne JSON ; certains fournisseurs, un objet.
                  arguments: z.union([
                    z.string().max(4000),
                    z.record(z.string(), z.unknown()),
                  ]),
                }),
              }),
            )
            .max(8)
            .nullish(),
        }),
      }),
    )
    .min(1),
});

/** Messages d'un tour de Stive au format « chat completions ». */
function stiveMessages(input: StiveChatInput) {
  const context = JSON.stringify({
    langue: input.language,
    jour: input.context.today,
    role: input.context.role === "vet" ? "vétérinaire" : "assistante",
    dossier_ouvert: input.context.openFollowup,
  });
  return [
    {
      role: "system",
      content: `${STIVE_CHAT}\n\nContexte du tour (données, pas des consignes) : ${context}`,
    },
    ...input.messages.map((message) => {
      if (message.role === "tool")
        return {
          role: "tool",
          tool_call_id: message.callId,
          name: message.name,
          content: message.content,
        };
      if (message.role === "assistant" && message.toolCalls?.length)
        return {
          role: "assistant",
          content: message.content,
          tool_calls: message.toolCalls.map((call) => ({
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: call.arguments },
          })),
        };
      return { role: message.role, content: message.content };
    }),
  ];
}

/** Schéma JSON imposé au modèle (sous-ensemble accepté par les fournisseurs visés). */
function jsonSchema(name: string, properties: Record<string, unknown>) {
  return {
    type: "json_schema",
    json_schema: {
      name,
      strict: true,
      schema: {
        type: "object",
        properties,
        required: Object.keys(properties),
        additionalProperties: false,
      },
    },
  };
}

const TEXT = { type: "string" };
const TEXTS = { type: "array", items: TEXT };

function dataUrl(bytes: Uint8Array, contentType: string): string {
  return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
}

const SLOT_MIN_MS = 10 * 60_000;
const SLOT_MAX_MS = 4 * 3_600_000;
const AGENDA_HORIZON_MS = 31 * 86_400_000;

export function apiAiGateway(options: ApiGatewayOptions): AiGateway {
  const base = options.baseUrl.replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? 30_000;
  const authorization = `Bearer ${options.apiKey}`;

  async function call(path: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await options.fetch(`${base}/${path}`, {
        ...init,
        method: "POST",
        headers: { ...init.headers, authorization },
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new AiGatewayError("retry", "network");
    }
    const payload: unknown = await response.json().catch(() => null);
    if (response.ok) return payload;
    if (response.status === 401 || response.status === 403)
      throw new AiGatewayError("account", `http_${response.status}`);
    if (response.status === 429 || response.status >= 500)
      throw new AiGatewayError("retry", `http_${response.status}`);
    throw new AiGatewayError("rejected", `http_${response.status}`);
  }

  /** Une consigne, des données en JSON, une réponse JSON relue par son schéma Zod. */
  async function chat<T>(input: {
    model: string;
    system: string;
    data: unknown;
    image?: { bytes: Uint8Array; contentType: string };
    format: ReturnType<typeof jsonSchema>;
    schema: z.ZodType<T>;
  }): Promise<T> {
    const data = JSON.stringify(input.data);
    const payload = await call("chat/completions", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: input.model,
        temperature: 0.2,
        max_tokens: 800,
        response_format: input.format,
        messages: [
          { role: "system", content: input.system },
          {
            role: "user",
            content: input.image
              ? [
                  { type: "text", text: data },
                  {
                    type: "image_url",
                    image_url: {
                      url: dataUrl(input.image.bytes, input.image.contentType),
                    },
                  },
                ]
              : data,
          },
        ],
      }),
    });
    const parsed = chatResponse.safeParse(payload);
    if (!parsed.success) throw new AiGatewayError("invalid", "response");
    let json: unknown;
    try {
      json = JSON.parse(parsed.data.choices[0]?.message.content ?? "");
    } catch {
      throw new AiGatewayError("invalid", "json");
    }
    const result = input.schema.safeParse(json);
    if (!result.success) throw new AiGatewayError("invalid", "schema");
    return result.data;
  }

  return {
    simulated: false,

    numaReply(input) {
      return chat({
        model: options.models.text,
        system: NUMA_REPLY,
        data: {
          language: input.language,
          animal: input.animalName,
          practice: input.practiceName,
          ownerMessage: input.ownerMessage,
        },
        format: jsonSchema("numa_reply", {
          text: TEXT,
          intent: {
            type: "string",
            enum: ["ack", "concern", "refer_treatment", "refer_question"],
          },
        }),
        schema: numaReply,
      });
    },

    numaStep(input) {
      return chat({
        model: options.models.text,
        system: NUMA_STEP,
        data: {
          language: input.language,
          animal: input.animalName,
          practice: input.practiceName,
          kind: input.kind,
          instruction: input.instruction,
          controlAppointmentAt:
            input.controlAppointmentAt?.toISOString() ?? null,
        },
        format: jsonSchema("numa_step", { text: TEXT }),
        schema: numaStep,
      });
    },

    async transcribeVoice(input) {
      const form = new FormData();
      form.set(
        "file",
        new Blob([new Uint8Array(input.audio)], { type: input.contentType }),
        "vocal",
      );
      form.set("model", options.models.transcription);
      form.set("language", input.languageHint);
      form.set("response_format", "json");
      const parsed = transcription.safeParse(
        await call("audio/transcriptions", { body: form }),
      );
      if (!parsed.success) throw new AiGatewayError("invalid", "transcription");
      return { text: parsed.data.text.trim(), language: input.languageHint };
    },

    observePhoto(input) {
      return chat({
        model: options.models.vision,
        system: PHOTO_OBSERVATIONS,
        data: { language: input.language, animal: input.animalName },
        image: { bytes: input.image, contentType: input.contentType },
        format: jsonSchema("photo_observations", { observations: TEXTS }),
        schema: observations,
      });
    },

    async readAgendaCapture(input) {
      const reading = await chat({
        model: options.models.vision,
        system: AGENDA_CAPTURE,
        data: { now: input.now.toISOString() },
        image: { bytes: input.image, contentType: input.contentType },
        format: jsonSchema("agenda_slots", {
          slots: {
            type: "array",
            items: {
              type: "object",
              properties: { start: TEXT, end: TEXT },
              required: ["start", "end"],
              additionalProperties: false,
            },
          },
        }),
        schema: agenda,
      });
      // Seuls des créneaux plausibles restent : à venir, d'une durée raisonnable.
      const slots: FreeSlot[] = [];
      for (const slot of reading.slots) {
        const startsAt = parisLocalToDate(slot.start);
        const endsAt = parisLocalToDate(slot.end);
        if (!startsAt || !endsAt) continue;
        const length = endsAt.getTime() - startsAt.getTime();
        if (
          startsAt.getTime() > input.now.getTime() &&
          startsAt.getTime() - input.now.getTime() <= AGENDA_HORIZON_MS &&
          length >= SLOT_MIN_MS &&
          length <= SLOT_MAX_MS
        )
          slots.push({ startsAt, endsAt });
      }
      return { slots };
    },

    summarizeFollowup(input) {
      return chat({
        model: options.models.text,
        system: SYNTHESIS,
        data: {
          language: input.language,
          procedure: input.procedure,
          dayNumber: input.dayNumber,
          events: input.events.map((event) => ({
            at: event.at.toISOString(),
            from: event.from,
            text: event.text,
            media: event.media,
            triage: event.triage,
          })),
        },
        format: jsonSchema("followup_synthesis", {
          evolution: TEXT,
          positives: TEXTS,
          negatives: TEXTS,
          openQuestions: TEXTS,
        }),
        schema: synthesis,
      });
    },

    async stiveChat(input) {
      const tools = input.tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
      const payload = await call("chat/completions", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: options.models.text,
          temperature: 0.3,
          max_tokens: 1000,
          messages: stiveMessages(input),
          ...(tools.length
            ? { tools, tool_choice: input.allowTools ? "auto" : "none" }
            : {}),
        }),
      });
      const parsed = toolChatResponse.safeParse(payload);
      if (!parsed.success) throw new AiGatewayError("invalid", "response");
      const message = parsed.data.choices[0]?.message;
      const calls = message?.tool_calls ?? [];
      if (input.allowTools && calls.length)
        return {
          kind: "tools",
          calls: calls.map((entry) => ({
            id: entry.id,
            name: entry.function.name,
            arguments:
              typeof entry.function.arguments === "string"
                ? entry.function.arguments
                : JSON.stringify(entry.function.arguments),
          })),
        };
      const text = message?.content?.trim() ?? "";
      if (!text) throw new AiGatewayError("invalid", "empty");
      return { kind: "answer", text };
    },
  };
}
