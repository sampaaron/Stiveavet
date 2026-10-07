import { fakeAiGateway } from "@/adapters/ai-gateway/fake";
import { fakeWhatsApp } from "@/adapters/whatsapp/fake";
import { conversationHandlers } from "@/domains/conversations/service";

import type { JobHandler, OutboxRoute } from "./worker";

/**
 * Exécutants des tâches et routes de l'outbox, par type. Le worker ne prend que les tâches
 * dont il connaît le type : une tâche d'un type pas encore livré attend sans échouer.
 * Phase 2 : WhatsApp et IA simulés uniquement (ADR 0004, ADR 0016). Les lots suivants y
 * ajoutent rappels et escalades.
 */
export const JOB_HANDLERS: Readonly<Record<string, JobHandler>> = {
  ...conversationHandlers({ whatsapp: fakeWhatsApp, ai: fakeAiGateway }),
};

export const OUTBOX_ROUTES: Readonly<Record<string, OutboxRoute>> = {};
