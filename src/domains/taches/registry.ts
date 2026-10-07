import type { JobHandler, OutboxRoute } from "./worker";

/**
 * Exécutants des tâches et routes de l'outbox, par type. Le worker ne prend que les tâches
 * dont il connaît le type : une tâche d'un type pas encore livré attend sans échouer.
 * Les lots suivants de la phase 2 y ajoutent rappels, messages de Numa et escalades.
 */
export const JOB_HANDLERS: Readonly<Record<string, JobHandler>> = {};

export const OUTBOX_ROUTES: Readonly<Record<string, OutboxRoute>> = {};
