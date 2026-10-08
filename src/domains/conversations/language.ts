/**
 * Langue d'un message du propriétaire (lot 19, ADR 0022) : règle écrite, sans IA ni réseau.
 * Elle ne tranche que sur un message assez long et sans ambiguïté ; un mot-clé (OUI, STOP),
 * un prénom ou un message mêlant les deux langues ne change rien. La langue choisie par le
 * cabinet n'est jamais remplacée (voir `learnLanguage` dans le service).
 */

const FRENCH = new Set(
  (
    "le la les un une des du de et est sont il elle ils elles je j tu nous vous " +
    "mon ma mes ton ta son sa ses notre votre leur pas ne plus très bien mais " +
    "avec pour dans sur ce cette ces qui que quoi quand comment pourquoi oui merci " +
    "bonjour bonsoir aujourd hui hier demain mange manger dort boit marche toujours " +
    "encore depuis un peu beaucoup chat chien elle il a ai avons avez ont été fait"
  ).split(" "),
);

const ENGLISH = new Set(
  (
    "the a an and is are was were he she it they i you we my your his her our " +
    "their not no but very well with for in on this that these those who what " +
    "when how why yes thanks thank hello hi today yesterday tomorrow eats eating " +
    "sleeps sleeping drinks walking still since bit lot cat dog has have had been " +
    "does did doing seems fine good"
  ).split(" "),
);

/** Mots communs aux deux listes : ils ne comptent pour aucune langue. */
const SHARED = new Set([...FRENCH].filter((word) => ENGLISH.has(word)));

const MIN_HITS = 3;

export function detectLanguage(text: string): "fr" | "en" | null {
  const words = text
    .toLowerCase()
    .normalize("NFC")
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
  let french = 0;
  let english = 0;
  for (const word of words) {
    if (SHARED.has(word)) continue;
    if (FRENCH.has(word)) french += 1;
    else if (ENGLISH.has(word)) english += 1;
  }
  // Accents propres au français : un indice de plus, jamais suffisant seul.
  if (/[àâçéèêëîïôûùœ]/u.test(text)) french += 1;
  const best = Math.max(french, english);
  if (best < MIN_HITS) return null;
  // Écart net exigé : au moins le double de l'autre langue.
  if (french >= 2 * english && french > english) return "fr";
  if (english >= 2 * french && english > french) return "en";
  return null;
}
