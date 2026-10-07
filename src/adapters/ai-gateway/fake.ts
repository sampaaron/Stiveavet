import type { AiGateway, NumaReply, NumaReplyInput } from "./types";

/**
 * Numa simulée : réponses tirées de règles écrites, sans hasard ni appel réseau, pour des
 * tests reproductibles. Elle ne rassure jamais, ne diagnostique pas et renvoie toute question
 * de traitement ou de gravité au vétérinaire. Textes fictifs, à valider par un vétérinaire.
 */

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

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
  const text = normalize(input.ownerMessage);
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

export const fakeAiGateway: AiGateway = {
  simulated: true,
  async numaReply(input) {
    return simulatedNumaReply(input);
  },
};
