import type { fr } from "./fr";

/** Même structure que le français, chaque texte pouvant différer. */
type Widen<T> = T extends string
  ? string
  : T extends readonly (infer Item)[]
    ? Widen<Item>[]
    : { [Key in keyof T]: Widen<T[Key]> };

export type SiteDictionary = Widen<typeof fr>;
