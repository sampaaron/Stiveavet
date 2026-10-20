/** Lecture des formulaires des Server Actions ; chaque valeur est ensuite validée par Zod. */

/**
 * Champ texte du formulaire, ou chaîne vide s'il manque ou n'est pas du texte. Le caractère
 * nul, que PostgreSQL refuse dans un texte, est retiré.
 */
export function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.replaceAll("\0", "") : "";
}

/** Contenu JSON envoyé par un éditeur, ou `null` s'il est illisible. */
export function parseJson(payload: string): unknown {
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
}
