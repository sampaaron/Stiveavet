/** Échappe un texte pour le corps HTML d'un e-mail. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Corps HTML d'un e-mail en paragraphes, chacun échappé. */
export function htmlParagraphs(lines: readonly string[]): string {
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}
