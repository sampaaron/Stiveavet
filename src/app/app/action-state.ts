/** Résultat d'une action de l'espace cabinet : un message court, jamais de donnée sensible. */
export type ActionState = { error?: string; notice?: string };

export const initialActionState: ActionState = {};
