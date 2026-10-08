/**
 * Textes fixes de Numa (cahier des charges §3 à §5) : présentation comme IA dès le premier
 * message, accord avant tout contenu clinique, STOP et REPRENDRE. Pas d'IA ici : ces textes
 * sont versionnés, et la version montrée est gardée avec chaque consentement.
 * Contenu à faire valider (juriste, cahier des charges §19) avant la mise en production.
 */
import { renderTemplate } from "@/domains/whatsapp/modeles";
import type { RenderedTemplate, TemplateKey } from "@/domains/whatsapp/modeles";

/** v2 (lot 21) : le premier message est un modèle WhatsApp et rappelle l'accord pris au cabinet. */
export const CONSENT_WORDING_VERSION = "consentement-v2";
/** Demande d'accord à deux propriétaires : le groupe partagé est expliqué avant l'accord (§6). */
export const PAIR_CONSENT_WORDING_VERSION = "consentement-groupe-v2";
/** Deux propriétaires sans groupe (WhatsApp réel) : chacun dans sa conversation (ADR 0024). */
export const SEPARATE_CONSENT_WORDING_VERSION = "consentement-deux-v1";

/** Version du texte d'accord montré, d'après le modèle du premier message. */
export const CONSENT_VERSION_OF: Partial<Record<TemplateKey, string>> = {
  suivi_premier_message: CONSENT_WORDING_VERSION,
  suivi_premier_message_groupe: PAIR_CONSENT_WORDING_VERSION,
  suivi_premier_message_deux: SEPARATE_CONSENT_WORDING_VERSION,
};

export type WordingContext = {
  language: "fr" | "en";
  ownerFirstName: string;
  animalName: string;
  practiceName: string;
  vetName: string;
  /** Second propriétaire du suivi (deux contacts, cahier des charges §6). */
  otherFirstName?: string;
};

/** Étapes envoyées comme modèles WhatsApp : elles peuvent partir hors de la fenêtre de 24 h. */
type TemplatedStep =
  | "intro"
  | "intro_pair"
  | "intro_separate"
  | "check_in"
  | "closing"
  | "stopped_by_other";

export type FixedStep =
  | TemplatedStep
  | "consent_given"
  | "consent_reminder"
  | "stopped"
  | "resumed"
  | "photo_received"
  | "file_refused"
  | "consent_given_waiting"
  | "group_welcome"
  | "stop_clarify"
  | "left_group"
  | "stopped_all";

const FR: Record<
  Exclude<FixedStep, TemplatedStep>,
  (c: WordingContext) => string
> = {
  consent_given: (c) =>
    `Merci ${c.ownerFirstName} ! C'est noté : je suivrai ${c.animalName} avec l'équipe de ${c.practiceName}. Vous pouvez m'écrire à tout moment, et en cas d'urgence appelez directement le cabinet. Écrivez STOP pour arrêter le suivi.`,
  consent_reminder: (c) =>
    `Pour que je puisse suivre ${c.animalName}, j'ai besoin de votre accord : répondez OUI pour l'accepter, ou STOP pour le refuser. Votre message est bien transmis à l'équipe de ${c.practiceName}.`,
  stopped: (c) =>
    `C'est noté : vous ne recevrez plus de messages de suivi pour ${c.animalName}. Écrivez REPRENDRE si vous changez d'avis. Pour toute question, contactez directement ${c.practiceName}.`,
  resumed: (c) =>
    `Bonne nouvelle, le suivi de ${c.animalName} reprend avec l'équipe de ${c.practiceName}. Écrivez STOP à tout moment pour l'arrêter.`,
  photo_received: (c) =>
    `Merci ${c.ownerFirstName}, la photo de ${c.animalName} est bien arrivée. Je la transmets à l'équipe de ${c.practiceName} : seul le vétérinaire peut l'interpréter. En cas d'urgence, appelez directement le cabinet.`,
  file_refused: (c) =>
    `Désolée ${c.ownerFirstName}, je n'ai pas pu recevoir ce fichier : il est trop lourd ou dans un format que je ne sais pas lire. Vous pouvez envoyer une photo ou un message vocal, ou décrire la situation par écrit. En cas d'urgence, appelez directement ${c.practiceName}.`,
  consent_given_waiting: (c) =>
    `Merci ${c.ownerFirstName} ! C'est noté. Dès que ${c.otherFirstName ?? "l'autre propriétaire"} aura accepté aussi, je créerai le groupe dédié au suivi de ${c.animalName}. En attendant, je vous écris ici. En cas d'urgence, appelez directement le cabinet.`,
  group_welcome: (c) =>
    `Bonjour ${c.ownerFirstName} ! Vous avez accepté le suivi de ${c.animalName} : voici le groupe qui lui est dédié. Je suis Numa, l'assistante IA (intelligence artificielle) de ${c.practiceName} ; je ne pose pas de diagnostic et l'équipe lit tous les messages. Chacun peut écrire ici. Écrivez STOP à tout moment pour arrêter.`,
  stop_clarify: (c) =>
    `${c.ownerFirstName}, vous avez écrit STOP. Souhaitez-vous seulement quitter le groupe, ou arrêter le suivi de ${c.animalName} ?\n\nRépondez GROUPE pour quitter le groupe : ${c.otherFirstName ?? "l'autre propriétaire"} continuera de recevoir les nouvelles. Répondez TOUT pour arrêter le suivi.\n\nEn attendant votre réponse, je ne vous envoie plus de message de suivi.`,
  left_group: (c) =>
    `C'est noté, vous avez quitté le groupe du suivi de ${c.animalName} : je ne vous enverrai plus de message de suivi. ${c.otherFirstName ?? "L'autre propriétaire"} continue avec l'équipe de ${c.practiceName}. Vous pouvez toujours m'écrire ici ; en cas d'urgence, appelez directement le cabinet.`,
  stopped_all: (c) =>
    `C'est noté : le suivi de ${c.animalName} s'arrête, je n'enverrai plus de message de suivi. Écrivez REPRENDRE si vous changez d'avis. Pour toute question, contactez directement ${c.practiceName}.`,
};

const EN: Record<
  Exclude<FixedStep, TemplatedStep>,
  (c: WordingContext) => string
> = {
  consent_given: (c) =>
    `Thank you ${c.ownerFirstName}! I will follow ${c.animalName} with the ${c.practiceName} team. You can write to me at any time; in an emergency, call the clinic directly. Write STOP to end the follow-up.`,
  consent_reminder: (c) =>
    `To follow ${c.animalName}, I need your agreement: reply YES to accept, or STOP to decline. Your message has been passed on to the ${c.practiceName} team.`,
  stopped: (c) =>
    `Noted: you will no longer receive follow-up messages about ${c.animalName}. Write RESUME if you change your mind. For any question, contact ${c.practiceName} directly.`,
  resumed: (c) =>
    `Good news, the follow-up of ${c.animalName} resumes with the ${c.practiceName} team. Write STOP at any time to end it.`,
  photo_received: (c) =>
    `Thank you ${c.ownerFirstName}, the photo of ${c.animalName} has arrived. I'm passing it on to the ${c.practiceName} team: only the vet can interpret it. In an emergency, call the clinic directly.`,
  file_refused: (c) =>
    `Sorry ${c.ownerFirstName}, I couldn't receive this file: it is too large or in a format I can't read. You can send a photo or a voice message, or describe the situation in writing. In an emergency, call ${c.practiceName} directly.`,
  consent_given_waiting: (c) =>
    `Thank you ${c.ownerFirstName}! As soon as ${c.otherFirstName ?? "the other owner"} accepts too, I will create the group for ${c.animalName}'s follow-up. Until then, I'll write to you here. In an emergency, call the clinic directly.`,
  group_welcome: (c) =>
    `Hello ${c.ownerFirstName}! You have accepted ${c.animalName}'s follow-up: this is its dedicated group. I'm Numa, the AI (artificial intelligence) assistant of ${c.practiceName}; I do not make diagnoses and the team reads every message. Everyone can write here. Write STOP at any time to end it.`,
  stop_clarify: (c) =>
    `${c.ownerFirstName}, you wrote STOP. Do you only want to leave the group, or stop ${c.animalName}'s follow-up?\n\nReply GROUP to leave the group: ${c.otherFirstName ?? "the other owner"} will keep receiving updates. Reply ALL to stop the follow-up.\n\nUntil you reply, I won't send you any follow-up message.`,
  left_group: (c) =>
    `Noted, you have left the group for ${c.animalName}'s follow-up: I won't send you any more follow-up messages. ${c.otherFirstName ?? "The other owner"} continues with the ${c.practiceName} team. You can still write to me here; in an emergency, call the clinic directly.`,
  stopped_all: (c) =>
    `Noted: ${c.animalName}'s follow-up stops, I won't send any more follow-up messages. Write RESUME if you change your mind. For any question, contact ${c.practiceName} directly.`,
};

function otherName(c: WordingContext): string {
  return (
    c.otherFirstName ??
    (c.language === "en" ? "the other owner" : "l'autre propriétaire")
  );
}

const TEMPLATED: Record<
  TemplatedStep,
  (c: WordingContext) => RenderedTemplate
> = {
  intro: (c) =>
    renderTemplate("suivi_premier_message", c.language, {
      first_name: c.ownerFirstName,
      practice: c.practiceName,
      vet: c.vetName,
      animal: c.animalName,
    }),
  intro_pair: (c) =>
    renderTemplate("suivi_premier_message_groupe", c.language, {
      first_name: c.ownerFirstName,
      practice: c.practiceName,
      vet: c.vetName,
      animal: c.animalName,
      other_first_name: otherName(c),
    }),
  intro_separate: (c) =>
    renderTemplate("suivi_premier_message_deux", c.language, {
      first_name: c.ownerFirstName,
      practice: c.practiceName,
      vet: c.vetName,
      animal: c.animalName,
      other_first_name: otherName(c),
    }),
  check_in: (c) =>
    renderTemplate("suivi_nouvelles", c.language, {
      animal: c.animalName,
      practice: c.practiceName,
    }),
  closing: (c) =>
    renderTemplate("suivi_cloture", c.language, {
      animal: c.animalName,
      practice: c.practiceName,
    }),
  stopped_by_other: (c) =>
    renderTemplate("suivi_arret_autre", c.language, {
      other_first_name: otherName(c),
      animal: c.animalName,
      practice: c.practiceName,
    }),
};

function isTemplated(step: FixedStep): step is TemplatedStep {
  return Object.hasOwn(TEMPLATED, step);
}

/** Message de Numa : texte libre, ou modèle WhatsApp (texte rendu, clé et paramètres). */
export type NumaContent = string | RenderedTemplate;

export function fixedContent(
  step: FixedStep,
  context: WordingContext,
): NumaContent {
  if (isTemplated(step)) return TEMPLATED[step](context);
  return (context.language === "en" ? EN : FR)[step](context);
}

export function fixedMessage(step: FixedStep, context: WordingContext): string {
  const content = fixedContent(step, context);
  return typeof content === "string" ? content : content.body;
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

export type EmergencyContext = {
  language: "fr" | "en";
  ownerFirstName: string;
  animalName: string;
  practiceName: string;
  /** Consignes du cabinet pour la période (jour, nuit, week-end, férié), telles qu'écrites. */
  instructions: string;
  contacts: readonly { label: string; phone: string }[];
};

/**
 * Consignes d'urgence envoyées tout de suite au propriétaire (cahier des charges §7), même
 * hors horaires et sans attendre l'escalade. Aucun diagnostic : Numa signale que le message
 * peut indiquer une urgence et renvoie vers le cabinet.
 */
export function emergencyMessage(context: EmergencyContext): string {
  const en = context.language === "en";
  const lines = context.contacts.map(
    (contact) => `• ${contact.label} : ${contact.phone}`,
  );
  const numbers = lines.length
    ? `${en ? "Numbers to call:" : "Numéros à appeler :"}\n${lines.join("\n")}`
    : en
      ? `Call ${context.practiceName} directly.`
      : `Appelez directement ${context.practiceName}.`;
  return en
    ? `${context.ownerFirstName}, your message may indicate an emergency for ${context.animalName}. Please do not wait: contact the clinic now.\n\nClinic instructions: ${context.instructions}\n\n${numbers}\n\nI have alerted the ${context.practiceName} team. You can keep writing to me here to give more details.`
    : `${context.ownerFirstName}, votre message peut signaler une urgence pour ${context.animalName}. N'attendez pas : contactez le cabinet maintenant.\n\nConsignes du cabinet : ${context.instructions}\n\n${numbers}\n\nJ'ai prévenu l'équipe de ${context.practiceName}. Vous pouvez continuer à m'écrire ici pour donner plus de détails.`;
}
