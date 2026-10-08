import { fakeAiGateway } from "@/adapters/ai-gateway/fake";
import { lazyObjectStorage } from "@/adapters/object-storage";
import { fakeWhatsApp } from "@/adapters/whatsapp/fake";
import { conversationHandlers } from "@/domains/conversations/service";
import { mediaHandlers } from "@/domains/fichiers/service";
import {
  planRetentionSweeps,
  retentionHandlers,
} from "@/domains/suivis/conservation";
import { followupEndHandlers } from "@/domains/suivis/rappels";
import { alertHandlers } from "@/domains/urgences/service";

import type { JobHandler, JobPlanner, OutboxRoute } from "./worker";

/**
 * Exécutants des tâches et routes de l'outbox, par type. Le worker ne prend que les tâches
 * dont il connaît le type : une tâche d'un type pas encore livré attend sans échouer.
 * Phase 2 : WhatsApp et IA simulés uniquement (ADR 0004, ADR 0016) ; rappels et fin du
 * suivi automatisé au lot 15 (ADR 0018) ; transcription, analyse photo et suppression des
 * fichiers au lot 16 (ADR 0019), sur le stockage objet local ; conservation des données au
 * lot 17 (ADR 0020).
 */
export const JOB_HANDLERS: Readonly<Record<string, JobHandler>> = {
  ...conversationHandlers({ whatsapp: fakeWhatsApp, ai: fakeAiGateway }),
  ...alertHandlers({ whatsapp: fakeWhatsApp }),
  ...followupEndHandlers(),
  ...mediaHandlers({ storage: lazyObjectStorage, ai: fakeAiGateway }),
  ...retentionHandlers({ storage: lazyObjectStorage }),
};

/** Tâches périodiques, inscrites par le worker de `pnpm worker` (pas par le simulateur). */
export const JOB_PLANNERS: readonly JobPlanner[] = [planRetentionSweeps];

export const OUTBOX_ROUTES: Readonly<Record<string, OutboxRoute>> = {};
