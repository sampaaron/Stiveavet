/** État renvoyé par une action de formulaire d'accès. Jamais de mot de passe renvoyé. */
export type FormState = {
  /** Message global, annoncé immédiatement. */
  error?: string;
  /** Message de réussite (demande prise en compte…). */
  notice?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
  /** Valeurs non sensibles à réafficher. */
  values?: Partial<Record<string, string>>;
};

export const initialFormState: FormState = {};
