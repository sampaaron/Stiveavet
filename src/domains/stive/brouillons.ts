import type { DraftTemplate } from "./demandes";

/**
 * Brouillons de message préparés par Stive (ADR 0034), dans la langue du propriétaire. Ce
 * sont des phrases d'organisation, sans aucun contenu médical : le vétérinaire les complète
 * et les envoie lui-même, depuis la conversation du dossier.
 */

export type DraftInput = {
  language: "fr" | "en";
  /** Prénoms des destinataires. */
  recipients: readonly string[];
  vetName: string;
  practiceName: string;
  animalName: string;
};

function list(names: readonly string[], and: string): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} ${and} ${names.at(-1)}`;
}

const TEXTS = {
  fr: {
    hello: (who: string, vet: string, practice: string) =>
      `Bonjour ${who}, c'est ${vet}, du cabinet ${practice}.`,
    helloAnonymous: (vet: string, practice: string) =>
      `Bonjour, c'est ${vet}, du cabinet ${practice}.`,
    news: (animal: string) =>
      `Je prends des nouvelles de ${animal} : comment se passe la journée ? Vous pouvez me répondre ici.`,
    photo: (animal: string) =>
      `Pourriez-vous m'envoyer une photo récente de ${animal}, prise à la lumière du jour ? Merci beaucoup.`,
    call: (animal: string) =>
      `Pourriez-vous appeler le cabinet quand vous le pouvez, au sujet de ${animal} ? Merci.`,
    and: "et",
  },
  en: {
    hello: (who: string, vet: string, practice: string) =>
      `Hello ${who}, this is ${vet} from ${practice}.`,
    helloAnonymous: (vet: string, practice: string) =>
      `Hello, this is ${vet} from ${practice}.`,
    news: (animal: string) =>
      `I'm checking in on ${animal}: how is the day going? You can reply here.`,
    photo: (animal: string) =>
      `Could you send me a recent photo of ${animal}, taken in daylight? Thank you.`,
    call: (animal: string) =>
      `Could you call the practice when you can, about ${animal}? Thank you.`,
    and: "and",
  },
} as const;

export function draftMessage(
  template: DraftTemplate,
  input: DraftInput,
): string {
  const text = TEXTS[input.language];
  const who = list(input.recipients, text.and);
  const hello = who
    ? text.hello(who, input.vetName, input.practiceName)
    : text.helloAnonymous(input.vetName, input.practiceName);
  return `${hello} ${text[template](input.animalName)}`;
}
