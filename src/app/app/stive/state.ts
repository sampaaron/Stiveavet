import type { ActionState } from "../action-state";

/** Retour d'une action de Stive : en cas d'échec, le message est rendu pour être renvoyé. */
export type StiveActionState = ActionState & { draft?: string };

export const initialStiveState: StiveActionState = {};
