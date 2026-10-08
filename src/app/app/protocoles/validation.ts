import type { AppDictionary } from "@/i18n/app/types";

/**
 * Message d'un refus de validation du contenu d'un protocole : le schéma du domaine renvoie un
 * code stable (`domains/protocoles/content.ts`), traduit ici dans la langue de la personne. Un
 * code inconnu (message par défaut de Zod) donne une phrase générique, jamais le texte brut.
 * Sert aussi aux étapes et signes d'alerte de la fiche de lancement d'un suivi.
 */
export function protocolIssueMessage(
  t: AppDictionary,
  code: string | undefined,
): string {
  const messages: Readonly<Record<string, string>> = t.protocols.validation;
  if (code !== undefined && Object.hasOwn(messages, code)) {
    const message = messages[code];
    if (message !== undefined) return message;
  }
  return t.protocols.invalidContent;
}
