/**
 * Textes fixes de Numa (cahier des charges §3 à §5) : présentation comme IA dès le premier
 * message, accord avant tout contenu clinique, STOP et REPRENDRE. Pas d'IA ici : ces textes
 * sont versionnés, et la version montrée est gardée avec chaque consentement.
 * Contenu à faire valider (juriste, cahier des charges §19) avant la mise en production.
 */
export const CONSENT_WORDING_VERSION = "consentement-v1";

export type WordingContext = {
  language: "fr" | "en";
  ownerFirstName: string;
  animalName: string;
  practiceName: string;
  vetName: string;
};

export type FixedStep =
  "intro" | "consent_given" | "consent_reminder" | "stopped" | "resumed";

const FR: Record<FixedStep, (c: WordingContext) => string> = {
  intro: (c) =>
    `Bonjour ${c.ownerFirstName}, je suis Numa, l'assistante IA (intelligence artificielle) de ${c.practiceName}. ${c.vetName} m'a demandé de prendre des nouvelles de ${c.animalName} après son passage au cabinet.\n\nJe ne pose pas de diagnostic et je ne modifie aucun traitement : toute décision médicale reste au vétérinaire, qui lit nos échanges.\n\nRépondez OUI pour accepter ce suivi sur WhatsApp. Vous pourrez écrire STOP à tout moment pour l'arrêter.`,
  consent_given: (c) =>
    `Merci ${c.ownerFirstName} ! C'est noté : je suivrai ${c.animalName} avec l'équipe de ${c.practiceName}. Vous pouvez m'écrire à tout moment, et en cas d'urgence appelez directement le cabinet. Écrivez STOP pour arrêter le suivi.`,
  consent_reminder: (c) =>
    `Pour que je puisse suivre ${c.animalName}, j'ai besoin de votre accord : répondez OUI pour l'accepter, ou STOP pour le refuser. Votre message est bien transmis à l'équipe de ${c.practiceName}.`,
  stopped: (c) =>
    `C'est noté : vous ne recevrez plus de messages de suivi pour ${c.animalName}. Écrivez REPRENDRE si vous changez d'avis. Pour toute question, contactez directement ${c.practiceName}.`,
  resumed: (c) =>
    `Bonne nouvelle, le suivi de ${c.animalName} reprend avec l'équipe de ${c.practiceName}. Écrivez STOP à tout moment pour l'arrêter.`,
};

const EN: Record<FixedStep, (c: WordingContext) => string> = {
  intro: (c) =>
    `Hello ${c.ownerFirstName}, I'm Numa, the AI (artificial intelligence) assistant of ${c.practiceName}. ${c.vetName} asked me to check on ${c.animalName} after the visit to the clinic.\n\nI do not make diagnoses or change any treatment: every medical decision stays with the vet, who reads our messages.\n\nReply YES to accept this follow-up on WhatsApp. You can write STOP at any time to end it.`,
  consent_given: (c) =>
    `Thank you ${c.ownerFirstName}! I will follow ${c.animalName} with the ${c.practiceName} team. You can write to me at any time; in an emergency, call the clinic directly. Write STOP to end the follow-up.`,
  consent_reminder: (c) =>
    `To follow ${c.animalName}, I need your agreement: reply YES to accept, or STOP to decline. Your message has been passed on to the ${c.practiceName} team.`,
  stopped: (c) =>
    `Noted: you will no longer receive follow-up messages about ${c.animalName}. Write REPRENDRE (resume) if you change your mind. For any question, contact ${c.practiceName} directly.`,
  resumed: (c) =>
    `Good news, the follow-up of ${c.animalName} resumes with the ${c.practiceName} team. Write STOP at any time to end it.`,
};

export function fixedMessage(step: FixedStep, context: WordingContext): string {
  return (context.language === "en" ? EN : FR)[step](context);
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
