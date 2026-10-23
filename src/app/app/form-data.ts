/** Lecture des formulaires des Server Actions ; chaque valeur est ensuite validée par Zod. */

/**
 * Champ texte du formulaire, ou chaîne vide s'il manque ou n'est pas du texte. Le caractère
 * nul, que PostgreSQL refuse dans un texte, est retiré.
 */
export function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.replaceAll("\0", "") : "";
}

/** Plusieurs champs texte d'un coup, à passer tels quels au schéma Zod de l'action. */
export function fields<const Name extends string>(
  form: FormData,
  names: readonly Name[],
): Record<Name, string> {
  return Object.fromEntries(
    names.map((name) => [name, text(form, name)]),
  ) as Record<Name, string>;
}

/** Contenu JSON envoyé par un éditeur, ou `null` s'il est illisible. */
export function parseJson(payload: string): unknown {
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
}
