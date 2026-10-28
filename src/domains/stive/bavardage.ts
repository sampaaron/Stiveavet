import { foldText } from "@/domains/commun/utilitaires";

/**
 * Échanges simples reconnus en mode simulé (ADR 0042) : salutation, remerciement, « qui
 * es-tu ? », « que sais-tu faire ? ». Stive y répond par des textes fixes, sans rien
 * inventer ; tout le reste demande l'IA branchée. Seulement pour un message court qui ne
 * contient pas autre chose : « Bonjour, quelle dose… » n'est pas une salutation.
 */

export type SmallTalk = "greeting" | "thanks" | "identity" | "help";

const IDENTITY =
  /\b(qui es[- ]tu|qui etes[- ]vous|tu es qui|t'es qui|es[- ]tu (une ia|un robot|humain)|tu es (une ia|un robot|humain)|etes[- ]vous (une ia|un robot|humain)|who are you|are you (an ai|a bot|a robot|human))\b/;
const HELP =
  /\b(que sais[- ]tu faire|que peux[- ]tu faire|tu sais faire quoi|tu peux faire quoi|que savez[- ]vous faire|que pouvez[- ]vous faire|comment ca marche|aide[- ]moi|^aide$|help|what can you do|how does (it|this) work)\b/;
const GREETING =
  /^(bonjour|bonsoir|salut|coucou|hello|hi|hey|good (morning|afternoon|evening))\b/;
const THANKS =
  /^(merci|thanks|thank you|super|parfait|top|genial|great|nickel|ok merci)\b/;

/** Au-delà, le message porte une vraie demande. */
const MAX_WORDS = { short: 4, question: 10 } as const;

export function recognizeSmallTalk(question: string): SmallTalk | null {
  const folded = foldText(question)
    .replace(/\bstive\b/g, " ")
    .replace(/[!?.,;:…]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!folded) return "greeting";
  const words = folded.split(" ").length;
  if (words <= MAX_WORDS.question) {
    if (IDENTITY.test(folded)) return "identity";
    if (HELP.test(folded)) return "help";
  }
  if (words <= MAX_WORDS.short) {
    if (GREETING.test(folded)) return "greeting";
    if (THANKS.test(folded)) return "thanks";
  }
  return null;
}
