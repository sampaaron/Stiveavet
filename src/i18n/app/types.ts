import type { fr } from "./fr";

/**
 * Même structure que le français, chaque texte pouvant différer. Un texte à compléter est
 * une fonction : ses paramètres sont vérifiés à la compilation, dans les deux langues.
 */
type Widen<T> = T extends string
  ? string
  : T extends (...args: infer Args) => string
    ? (...args: Args) => string
    : T extends readonly (infer Item)[]
      ? Widen<Item>[]
      : { [Key in keyof T]: Widen<T[Key]> };

export type AppDictionary = Widen<typeof fr>;
