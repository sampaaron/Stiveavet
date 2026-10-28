/**
 * Champs d'un modèle de réponse (ADR 0048), remplacés au moment où le texte est posé dans la
 * zone de saisie : le modèle lui-même ne contient jamais le nom d'un animal ou d'une personne.
 */
export const TEMPLATE_FIELDS = [
  "animal",
  "proprietaire",
  "veterinaire",
  "cabinet",
] as const;
export type TemplateField = (typeof TEMPLATE_FIELDS)[number];

const FIELD = /\{(animal|proprietaire|veterinaire|cabinet)\}/g;

/** Texte prêt à relire ; un champ sans valeur est retiré proprement, sans laisser « {} ». */
export function fillTemplate(
  body: string,
  values: Partial<Record<TemplateField, string>>,
): string {
  return body
    .replace(
      FIELD,
      (_match, field: TemplateField) => values[field]?.trim() ?? "",
    )
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
