import type { NumaIntent } from "@/adapters/ai-gateway/types";

/**
 * Réponses fixes de Numa (textes fictifs, à valider par un vétérinaire). Dès que la passerelle
 * IA classe un message autrement que « simples nouvelles » (inquiétude, traitement, question),
 * c'est l'un de ces textes qui part, jamais le texte rédigé par le modèle : une consigne glissée
 * par le propriétaire ne peut donc pas faire écrire un conseil médical à Numa.
 */

type ReplyContext = { animalName: string; practiceName: string };

const FR = {
  refer_treatment: (i: ReplyContext) =>
    `Je ne peux pas vous conseiller sur un traitement : seul le vétérinaire peut en décider. Je transmets votre question à l'équipe de ${i.practiceName}, qui vous répondra. En cas d'urgence, appelez directement le cabinet.`,
  concern: (i: ReplyContext) =>
    `Merci de me prévenir. Je transmets tout de suite votre message à l'équipe de ${i.practiceName}. Si ${i.animalName} vous semble en danger, appelez le cabinet sans attendre. Depuis quand l'observez-vous ? Une photo peut aider l'équipe.`,
  refer_question: (i: ReplyContext) =>
    `Je ne peux pas en juger moi-même : seul le vétérinaire peut répondre à cette question. Je la transmets à l'équipe de ${i.practiceName}. En cas d'urgence, appelez directement le cabinet.`,
  ack: (i: ReplyContext) =>
    `Merci pour ces nouvelles de ${i.animalName}, c'est noté pour l'équipe de ${i.practiceName}.`,
};

const EN = {
  refer_treatment: (i: ReplyContext) =>
    `I can't advise on any treatment: only the vet can decide. I'm passing your question on to the ${i.practiceName} team, who will get back to you. In an emergency, call the clinic directly.`,
  concern: (i: ReplyContext) =>
    `Thank you for letting me know. I'm passing your message on to the ${i.practiceName} team right away. If ${i.animalName} seems to be in danger, call the clinic without waiting. Since when have you noticed it? A photo can help the team.`,
  refer_question: (i: ReplyContext) =>
    `I can't judge that myself: only the vet can answer this question. I'm passing it on to the ${i.practiceName} team. In an emergency, call the clinic directly.`,
  ack: (i: ReplyContext) =>
    `Thank you for the news about ${i.animalName}, I've noted it for the ${i.practiceName} team.`,
};

export function numaFixedReply(
  intent: NumaIntent,
  context: ReplyContext & { language: "fr" | "en" },
): string {
  return (context.language === "en" ? EN : FR)[intent](context);
}
