/** Codes d'erreur du formulaire de démo ; les textes sont dans les dictionnaires du site. */
export type DemoErrorCode =
  | "email"
  | "too_long"
  | "cabinet_short"
  | "cabinet_long"
  | "vets"
  | "rate_limited";

export type DemoFormState = {
  error?: "rate_limited";
  fieldErrors?: Partial<Record<"email" | "cabinetName" | "vetCount", string>>;
  values?: { email: string; cabinetName: string; vetCount: string };
};

export type UnsubscribeState = "idle" | "done" | "invalid";
