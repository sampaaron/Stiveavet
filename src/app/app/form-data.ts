/** Lecture des formulaires des Server Actions ; chaque valeur est ensuite validée par Zod. */

/** Champ texte du formulaire, ou chaîne vide s'il manque ou n'est pas du texte. */
export function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/** Contenu JSON envoyé par un éditeur, ou `null` s'il est illisible. */
export function parseJson(payload: string): unknown {
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
}
