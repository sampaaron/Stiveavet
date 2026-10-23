/** Petits utilitaires sans dépendance, partagés par plusieurs domaines. */

/**
 * Forme comparable d'un texte libre : sans accents, en minuscules, apostrophes unifiées.
 * Sert aux détections par mots-clés (urgence, refus, plan de soins) et aux recherches.
 */
export function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’`]/g, "'");
}

/** Heure murale « HH:MM » en minutes depuis minuit. */
export function minutesOfDay(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** Octets mis bout à bout, dans l'ordre. */
export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
