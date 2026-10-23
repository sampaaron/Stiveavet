import { COMMON_PASSWORDS } from "./mots-de-passe-courants";

/**
 * Mots de passe courants (FR et EN), embarqués localement : aucune requête vers un service
 * externe. La liste (`mots-de-passe-courants.ts`, plus de 15 000 racines) est chargée une
 * seule fois, au premier contrôle. La comparaison se fait sur une forme normalisée, si bien
 * que « Azerty2024! », « P@ssw0rd » ou « mot de passe » sont refusés comme leur racine.
 */

const LEET: Readonly<Record<string, string>> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
  "!": "i",
};

/**
 * Racine d'un mot de passe : minuscules sans accents, sans chiffres ni symboles en début et
 * en fin, sans espaces ni séparateurs, chiffres et symboles « leet » remplacés par la lettre
 * qu'ils imitent. Sans lettre, la racine est vide.
 */
export function passwordRoot(password: string): string {
  return password
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "")
    .replace(/[\s._-]+/gu, "")
    .replace(/[013457@$!]/g, (char) => LEET[char] ?? char);
}

// Suites de touches ou de caractères : un mot de passe qui en est un extrait est refusé.
const SEQUENCES = [
  "01234567890123456789",
  "98765432109876543210",
  "abcdefghijklmnopqrstuvwxyz",
  "azertyuiopqsdfghjklmwxcvbn",
  "qwertyuiopasdfghjklzxcvbnm",
  "qwertzuiopasdfghjklyxcvbnm",
];

let roots: ReadonlySet<string> | undefined;

function commonRoots(): ReadonlySet<string> {
  roots ??= new Set(COMMON_PASSWORDS.split("\n").filter(Boolean));
  return roots;
}

export function isCommonPassword(password: string): boolean {
  const compact = password.toLowerCase().replace(/[\s._-]+/gu, "");
  if (
    compact.length >= 4 &&
    SEQUENCES.some((sequence) => sequence.includes(compact))
  )
    return true;
  const root = passwordRoot(password);
  if (!root) return false;
  if (commonRoots().has(root)) return true;
  // Racine répétée (« soleilsoleil », « abcabcabcabc ») : aussi faible que sa base.
  const unit = /^(.+?)\1+$/u.exec(root)?.[1];
  return !!unit && (unit.length <= 3 || commonRoots().has(unit));
}
