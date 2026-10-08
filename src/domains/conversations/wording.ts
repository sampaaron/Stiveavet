/**
 * Textes fixes de Numa (cahier des charges §3 à §5) : présentation comme IA dès le premier
 * message, accord avant tout contenu clinique, STOP et REPRENDRE. Pas d'IA ici : ces textes
 * sont versionnés, et la version montrée est gardée avec chaque consentement.
 * Contenu à faire valider (juriste, cahier des charges §19) avant la mise en production.
 */
export const CONSENT_WORDING_VERSION = "consentement-v1";
/** Demande d'accord à deux propriétaires : le groupe partagé est expliqué avant l'accord (§6). */
export const PAIR_CONSENT_WORDING_VERSION = "consentement-groupe-v1";

export type WordingContext = {
  language: "fr" | "en";
  ownerFirstName: string;
  animalName: string;
  practiceName: string;
  vetName: string;
  /** Second propriétaire du suivi (deux contacts, cahier des charges §6). */
  otherFirstName?: string;
};

export type FixedStep =
  | "intro"
  | "consent_given"
  | "consent_reminder"
  | "stopped"
  | "resumed"
  | "closing"
  | "check_in"
  | "photo_received"
  | "intro_pair"
  | "consent_given_waiting"
  | "group_welcome"
  | "stop_clarify"
  | "left_group"
  | "stopped_all"
  | "stopped_by_other";

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
  check_in: (c) =>
    `Comment va ${c.animalName} ? Vous pouvez me répondre ici : l'équipe de ${c.practiceName} lira votre message. En cas d'urgence, appelez directement le cabinet.`,
  photo_received: (c) =>
    `Merci ${c.ownerFirstName}, la photo de ${c.animalName} est bien arrivée. Je la transmets à l'équipe de ${c.practiceName} : seul le vétérinaire peut l'interpréter. En cas d'urgence, appelez directement le cabinet.`,
  closing: (c) =>
    `Le suivi de ${c.animalName} prévu par ${c.practiceName} se termine aujourd'hui, date du rendez-vous de contrôle. Je ne vous enverrai plus de message de suivi. Cette conversation reste ouverte : si vous m'écrivez, je transmets votre message à l'équipe. En cas d'urgence, appelez directement le cabinet.`,
  intro_pair: (c) =>
    `${FR.intro(c).split("\n\nRépondez OUI")[0]}\n\nCe suivi est proposé aussi à ${c.otherFirstName ?? "l'autre propriétaire"}. Si vous l'acceptez tous les deux, je créerai un groupe WhatsApp dédié au suivi de ${c.animalName} : vous y verrez tous les deux les messages, les vôtres comme les miens.\n\nRépondez OUI pour accepter ce suivi sur WhatsApp. Vous pourrez écrire STOP à tout moment pour l'arrêter.`,
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
  stopped_by_other: (c) =>
    `${c.otherFirstName ?? "L'autre propriétaire"} a demandé l'arrêt du suivi de ${c.animalName} : je n'enverrai plus de message de suivi. Vous pouvez toujours écrire ici, votre message sera transmis à l'équipe de ${c.practiceName}. En cas d'urgence, appelez directement le cabinet.`,
};

const EN: Record<FixedStep, (c: WordingContext) => string> = {
  intro: (c) =>
    `Hello ${c.ownerFirstName}, I'm Numa, the AI (artificial intelligence) assistant of ${c.practiceName}. ${c.vetName} asked me to check on ${c.animalName} after the visit to the clinic.\n\nI do not make diagnoses or change any treatment: every medical decision stays with the vet, who reads our messages.\n\nReply YES to accept this follow-up on WhatsApp. You can write STOP at any time to end it.`,
  consent_given: (c) =>
    `Thank you ${c.ownerFirstName}! I will follow ${c.animalName} with the ${c.practiceName} team. You can write to me at any time; in an emergency, call the clinic directly. Write STOP to end the follow-up.`,
  consent_reminder: (c) =>
    `To follow ${c.animalName}, I need your agreement: reply YES to accept, or STOP to decline. Your message has been passed on to the ${c.practiceName} team.`,
  stopped: (c) =>
    `Noted: you will no longer receive follow-up messages about ${c.animalName}. Write RESUME if you change your mind. For any question, contact ${c.practiceName} directly.`,
  resumed: (c) =>
    `Good news, the follow-up of ${c.animalName} resumes with the ${c.practiceName} team. Write STOP at any time to end it.`,
  check_in: (c) =>
    `How is ${c.animalName} doing? You can reply here: the ${c.practiceName} team will read your message. In an emergency, call the clinic directly.`,
  photo_received: (c) =>
    `Thank you ${c.ownerFirstName}, the photo of ${c.animalName} has arrived. I'm passing it on to the ${c.practiceName} team: only the vet can interpret it. In an emergency, call the clinic directly.`,
  closing: (c) =>
    `The follow-up of ${c.animalName} planned by ${c.practiceName} ends today, the date of the check-up. I won't send you any more follow-up messages. This conversation stays open: if you write to me, I'll pass your message on to the team. In an emergency, call the clinic directly.`,
  intro_pair: (c) =>
    `${EN.intro(c).split("\n\nReply YES")[0]}\n\nThis follow-up is also offered to ${c.otherFirstName ?? "the other owner"}. If you both accept, I will create a WhatsApp group dedicated to ${c.animalName}'s follow-up: you will both see all messages there, yours and mine.\n\nReply YES to accept this follow-up on WhatsApp. You can write STOP at any time to end it.`,
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
  stopped_by_other: (c) =>
    `${c.otherFirstName ?? "The other owner"} asked to stop ${c.animalName}'s follow-up: I won't send any more follow-up messages. You can still write here, your message will be passed on to the ${c.practiceName} team. In an emergency, call the clinic directly.`,
};

export function fixedMessage(step: FixedStep, context: WordingContext): string {
  return (context.language === "en" ? EN : FR)[step](context);
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
