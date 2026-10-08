import { foldText } from "@/domains/commun";
import { parisLocalToDate, parisWallMinutes } from "@/domains/reglages/content";

import { simulatedSynthesis } from "./simulated-synthesis";
import { readSimulatedVoiceText } from "./simulated-voice";
import type {
  AgendaCaptureInput,
  AiGateway,
  FreeSlot,
  NumaReply,
  NumaReplyInput,
  NumaStepInput,
  PhotoObservationInput,
  VoiceTranscription,
  VoiceTranscriptionInput,
} from "./types";

/**
 * Numa simulée : réponses tirées de règles écrites, sans hasard ni appel réseau, pour des
 * tests reproductibles. Elle ne rassure jamais, ne diagnostique pas et renvoie toute question
 * de traitement ou de gravité au vétérinaire. Textes fictifs, à valider par un vétérinaire.
 */

const TREATMENT =
  /\b(dose|doses|dosage|posologie|mg|ml|comprime|comprimes|cachet|gelule|medicament|medicaments|traitement|antibiotique|anti-inflammatoire|metacam|paracetamol|doliprane|aspirine|ibuprofene|pommade|donner|redonner|augmenter|arreter|medication|medicine|pill|pills|tablet|dose|give him|give her|ibuprofen|painkiller)\b/;
const CONCERN =
  /(saign|sang|vomi|diarrh|ne mange|mange pas|mange plus|boit pas|boit plus|gonfl|enfl|fievre|chaud|douleur|a mal|souffr|pleure|gemit|gemis|abattu|apathi|respir|halet|plaie|ouvert|pus|odeur|rouge|boite|tremble|convuls|evanoui|bleed|blood|vomit|diarrh|swollen|swelling|pain|not eating|won.t eat|lethargic|breathing|wound|limp)/;
const SEVERITY =
  /(diagnostic|infect|tout va bien|rassur|est-ce grave|c.est grave|est-ce normal|c.est normal|normal que|inquiet|inquiete|dois-je m.inquieter|faut-il s.inquieter|is it normal|is this normal|is it serious|should i worry|worried|diagnos|reassure|is everything ok)/;

const FR = {
  refer_treatment: (i: NumaReplyInput) =>
    `Je ne peux pas vous conseiller sur un traitement : seul le vétérinaire peut en décider. Je transmets votre question à l'équipe de ${i.practiceName}, qui vous répondra. En cas d'urgence, appelez directement le cabinet.`,
  concern: (i: NumaReplyInput) =>
    `Merci de me prévenir. Je transmets tout de suite votre message à l'équipe de ${i.practiceName}. Si ${i.animalName} vous semble en danger, appelez le cabinet sans attendre. Depuis quand l'observez-vous ? Une photo peut aider l'équipe.`,
  refer_question: (i: NumaReplyInput) =>
    `Je ne peux pas en juger moi-même : seul le vétérinaire peut répondre à cette question. Je la transmets à l'équipe de ${i.practiceName}. En cas d'urgence, appelez directement le cabinet.`,
  ack: (i: NumaReplyInput) =>
    `Merci pour ces nouvelles de ${i.animalName}, c'est noté pour l'équipe de ${i.practiceName}.`,
};

const EN = {
  refer_treatment: (i: NumaReplyInput) =>
    `I can't advise on any treatment: only the vet can decide. I'm passing your question on to the ${i.practiceName} team, who will get back to you. In an emergency, call the clinic directly.`,
  concern: (i: NumaReplyInput) =>
    `Thank you for letting me know. I'm passing your message on to the ${i.practiceName} team right away. If ${i.animalName} seems to be in danger, call the clinic without waiting. Since when have you noticed it? A photo can help the team.`,
  refer_question: (i: NumaReplyInput) =>
    `I can't judge that myself: only the vet can answer this question. I'm passing it on to the ${i.practiceName} team. In an emergency, call the clinic directly.`,
  ack: (i: NumaReplyInput) =>
    `Thank you for the news about ${i.animalName}, I've noted it for the ${i.practiceName} team.`,
};

export function simulatedNumaReply(input: NumaReplyInput): NumaReply {
  const text = foldText(input.ownerMessage);
  const intent: NumaReply["intent"] = CONCERN.test(text)
    ? "concern"
    : TREATMENT.test(text)
      ? "refer_treatment"
      : SEVERITY.test(text)
        ? "refer_question"
        : "ack";
  const templates = input.language === "en" ? EN : FR;
  return { text: templates[intent](input), intent };
}

function appointment(at: Date, language: "fr" | "en"): string {
  const locale = language === "en" ? "en-GB" : "fr-FR";
  const day = new Intl.DateTimeFormat(locale, {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(at);
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
  return language === "en" ? `on ${day} at ${time}` : `le ${day} à ${time}`;
}

/**
 * Étape programmée, en simulation : un texte fixe par type d'étape. Une vraie IA suivrait la
 * consigne du vétérinaire dans la langue du propriétaire ; la simulation, elle, ne reprend la
 * consigne telle quelle qu'en français, pour les questions et les rappels.
 */
export function simulatedNumaStep(input: NumaStepInput): { text: string } {
  const { animalName: animal, practiceName: practice } = input;
  if (input.language === "en") {
    const texts: Record<NumaStepInput["kind"], string> = {
      message: `Hello, this is Numa, the AI assistant of ${practice}. How is ${animal} doing? Tell me in a few words, the team will read your reply.`,
      question: `A follow-up question about ${animal}: is ${animal} eating, drinking and moving around as usual? The ${practice} team will read your reply.`,
      photo_request: `To help the ${practice} team follow ${animal}'s recovery, could you send me a photo of the operated area, taken in daylight?`,
      reminder: `A reminder from the ${practice} team about ${animal}'s follow-up. Reply here if you have any question for the team.`,
      control: input.controlAppointmentAt
        ? `Reminder: ${animal}'s check-up appointment at ${practice} is ${appointment(input.controlAppointmentAt, "en")}. If you can't make it, write it here and the team will offer another slot.`
        : `Remember to book ${animal}'s check-up appointment with ${practice}.`,
    };
    return { text: texts[input.kind] };
  }
  const texts: Record<NumaStepInput["kind"], string> = {
    message: `Bonjour, ici Numa, l'assistante IA de ${practice}. Comment va ${animal} ? Racontez-moi en quelques mots, l'équipe lira votre réponse.`,
    question: `Une question de suivi pour ${animal} : ${input.instruction}`,
    photo_request: `Pour aider l'équipe de ${practice} à suivre ${animal}, pourriez-vous m'envoyer une photo de la zone opérée, prise à la lumière du jour ?`,
    reminder: `Un rappel de l'équipe de ${practice} : ${input.instruction}`,
    control: input.controlAppointmentAt
      ? `Rappel : le rendez-vous de contrôle de ${animal} chez ${practice} est prévu ${appointment(input.controlAppointmentAt, "fr")}. Si vous ne pouvez pas venir, écrivez-le ici : l'équipe vous proposera un autre créneau.`
      : `Pensez à prendre rendez-vous auprès de ${practice} pour le contrôle de ${animal}.`,
  };
  return { text: texts[input.kind] };
}

/**
 * Transcription simulée : le texte « prononcé » d'un vocal du simulateur ; pour tout autre
 * fichier, une mention qui invite à écouter le message (aucune transcription inventée).
 */
export function simulatedTranscription(
  input: VoiceTranscriptionInput,
): VoiceTranscription {
  const spoken = readSimulatedVoiceText(input.audio);
  if (spoken) return { text: spoken, language: input.languageHint };
  return {
    text:
      input.languageHint === "en"
        ? "(Simulated transcription unavailable for this file: please listen to the message.)"
        : "(Transcription simulée indisponible pour ce fichier : écoutez le message.)",
    language: input.languageHint,
  };
}

/** Analyse photo simulée : aucune image n'est examinée, et elle le dit. */
export function simulatedPhotoObservations(input: PhotoObservationInput): {
  observations: string[];
} {
  return {
    observations:
      input.language === "en"
        ? [
            "Simulated analysis: no image is actually examined in this version.",
            `A photo of ${input.animalName} was received; only the vet can interpret it.`,
          ]
        : [
            "Analyse simulée : aucune image n'est réellement examinée dans cette version.",
            `Une photo de ${input.animalName} a été reçue ; seul le vétérinaire peut l'interpréter.`,
          ],
  };
}

const CAPTURE_TIMES = ["09:30", "11:00", "14:30", "16:00"] as const;
const CAPTURE_SLOT_MINUTES = 30;
const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Lecture simulée d'une capture d'agenda : quatre créneaux libres de 30 minutes sur chacun
 * des deux prochains jours ouvrés (heure de Paris). Une vraie lecture les tirera de l'image.
 */
export function simulatedAgendaReading(input: AgendaCaptureInput): {
  slots: FreeSlot[];
} {
  const today = Math.floor(parisWallMinutes(input.now) / 1440);
  const slots: FreeSlot[] = [];
  for (let offset = 1; slots.length < 8 && offset <= 7; offset += 1) {
    const day = new Date((today + offset) * 86_400_000);
    const weekday = day.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const date = `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`;
    for (const time of CAPTURE_TIMES) {
      const startsAt = parisLocalToDate(`${date}T${time}`);
      if (!startsAt) continue;
      slots.push({
        startsAt,
        endsAt: new Date(startsAt.getTime() + CAPTURE_SLOT_MINUTES * 60_000),
      });
    }
  }
  return { slots };
}

export const fakeAiGateway: AiGateway = {
  simulated: true,
  async numaReply(input) {
    return simulatedNumaReply(input);
  },
  async numaStep(input) {
    return simulatedNumaStep(input);
  },
  async transcribeVoice(input) {
    return simulatedTranscription(input);
  },
  async observePhoto(input) {
    return simulatedPhotoObservations(input);
  },
  async readAgendaCapture(input) {
    return simulatedAgendaReading(input);
  },
  async summarizeFollowup(input) {
    return simulatedSynthesis(input);
  },
};
