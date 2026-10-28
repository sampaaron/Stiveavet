import type {
  AiGateway,
  StiveChatInput,
  StiveChatMessage,
  StiveToolCall,
} from "@/adapters/ai-gateway/types";

import { STIVE_TOOLS, describeAnswer } from "./outils";
import type { StiveAnswer } from "./reponses";

/**
 * Un tour de conversation avec Stive branché sur l'IA (ADR 0042) : l'historique borné, puis
 * la boucle « le modèle demande des outils, le serveur les exécute, le modèle répond ».
 * Pure vis-à-vis de la base : l'exécution des outils est fournie par le service, avec les
 * droits de la personne. Bornée en tours, en appels d'outils et en durée.
 */

export const TURN_LIMITS = {
  /** Appels au modèle par message de la personne ; le dernier exige une réponse écrite. */
  rounds: 4,
  /** Outils exécutés par message de la personne. */
  toolCalls: 6,
  /** Durée totale d'un tour, en millisecondes. */
  durationMs: 60_000,
} as const;

/** Messages de l'historique transmis au modèle (questions et réponses confondues). */
export const HISTORY_MESSAGES = 12;
const MAX_HISTORY_TEXT = 1500;

export class StiveTurnError extends Error {
  constructor(readonly code: "deadline" | "rounds") {
    super(`stive:${code}`);
  }
}

/** Échange déjà affiché, filtré par les accès du moment (null : réponse masquée). */
export type HistoryEntry =
  | { author: "member"; question: string }
  | { author: "stive"; answer: StiveAnswer | null };

const clip = (text: string) =>
  text.length > MAX_HISTORY_TEXT ? `${text.slice(0, MAX_HISTORY_TEXT)}…` : text;

/**
 * Messages envoyés au modèle : les derniers échanges (bornés), puis la question. Une réponse
 * de Stive faite de plusieurs cartes devient un seul message, une ligne par carte ; une
 * réponse masquée (dossier devenu inaccessible) n'est jamais transmise.
 */
export function chatMessages(
  history: readonly HistoryEntry[],
  question: string,
  limit = HISTORY_MESSAGES,
): StiveChatMessage[] {
  const messages: StiveChatMessage[] = [];
  for (const entry of history) {
    if (entry.author === "member") {
      messages.push({ role: "user", content: clip(entry.question) });
      continue;
    }
    const line = entry.answer
      ? describeAnswer(entry.answer)
      : "[Réponse masquée : dossier devenu inaccessible]";
    if (!line) continue;
    const previous = messages.at(-1);
    if (previous?.role === "assistant")
      previous.content = clip(`${previous.content}\n${line}`);
    else messages.push({ role: "assistant", content: clip(line) });
  }
  const recent = messages.slice(-limit);
  // L'historique commence toujours par une question de la personne.
  while (recent[0]?.role === "assistant") recent.shift();
  return [...recent, { role: "user", content: question }];
}

export type ToolExecutor = (call: StiveToolCall) => Promise<unknown>;

export async function runStiveTurn(input: {
  ai: AiGateway;
  language: StiveChatInput["language"];
  context: StiveChatInput["context"];
  messages: StiveChatMessage[];
  execute: ToolExecutor;
  limits?: { rounds: number; toolCalls: number; durationMs: number };
  clock?: () => number;
}): Promise<{ text: string; toolCalls: number }> {
  const limits = input.limits ?? TURN_LIMITS;
  const clock = input.clock ?? Date.now;
  const deadline = clock() + limits.durationMs;
  const messages = [...input.messages];
  let used = 0;
  for (let round = 0; round < limits.rounds; round += 1) {
    if (clock() > deadline) throw new StiveTurnError("deadline");
    const allowTools = round < limits.rounds - 1 && used < limits.toolCalls;
    const step = await input.ai.stiveChat({
      language: input.language,
      context: input.context,
      messages,
      tools: [...STIVE_TOOLS],
      allowTools,
    });
    if (step.kind === "answer") return { text: step.text, toolCalls: used };
    messages.push({ role: "assistant", content: "", toolCalls: step.calls });
    // Chaque appel reçoit un résultat, même au-delà de la limite : le format l'exige.
    for (const call of step.calls) {
      let result: unknown;
      if (used >= limits.toolCalls || clock() > deadline)
        result = {
          erreur:
            "Limite d'outils atteinte pour ce message : réponds avec ce que tu sais déjà.",
        };
      else {
        used += 1;
        result = await input.execute(call);
      }
      messages.push({
        role: "tool",
        callId: call.id,
        name: call.name,
        content: JSON.stringify(result),
      });
    }
  }
  throw new StiveTurnError("rounds");
}
