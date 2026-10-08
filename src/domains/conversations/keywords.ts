/**
 * Mots-clés du propriétaire (cahier des charges §5) : OUI donne l'accord, STOP suspend les
 * relances et le consentement, REPRENDRE recrée l'accord. Un message n'est un mot-clé que
 * s'il ne contient que lui (ponctuation et casse ignorées) : « je ne veux pas que ça
 * s'arrête » n'est jamais un STOP.
 */
export type OwnerKeyword = "yes" | "stop" | "resume" | null;

const KEYWORDS: Record<Exclude<OwnerKeyword, null>, readonly string[]> = {
  yes: ["oui", "yes", "ok oui", "oui merci", "yes please", "d accord"],
  stop: ["stop", "arret", "arreter", "stop numa", "unsubscribe"],
  resume: ["reprendre", "resume", "start", "restart"],
};

export function normalizeKeyword(body: string): string {
  return body
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function ownerKeyword(body: string): OwnerKeyword {
  const text = normalizeKeyword(body);
  for (const [keyword, forms] of Object.entries(KEYWORDS) as [
    Exclude<OwnerKeyword, null>,
    readonly string[],
  ][])
    if (forms.includes(text)) return keyword;
  return null;
}
