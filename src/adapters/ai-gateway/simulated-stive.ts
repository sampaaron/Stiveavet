import { foldText } from "@/domains/commun";

import type { StiveCase, StiveChatInput } from "./types";

/**
 * Stive simulé (ADR 0035) : réponses construites par règles, sans hasard ni appel réseau,
 * pour que l'écran soit utilisable en local sans clé. Il reprend ce que le dossier contient
 * vraiment, n'invente rien, signale les urgences d'abord et laisse toujours la décision au
 * vétérinaire. Textes fictifs, à faire relire par un vétérinaire.
 */

type Topic =
  | "greeting"
  | "medication"
  | "owner_message"
  | "organization"
  | "wound"
  | "pain"
  | "digestive"
  | "case_review";

const URGENT =
  /(detresse|respire mal|ne respire|dyspnee|cyanose|convuls|crise d.epilepsie|hemorrag|saigne beaucoup|saignement abondant|collapsus|s.effondre|inconscien|intoxi|empoisonn|dilatation|torsion|abdomen (gonfle|distendu)|n.urine plus|anurie|dehiscen|eventration|bleeding heavily|not breathing|breathing difficult|seizure|collapse|poison|bloat|not urinating)/;

const TOPICS: [Topic, RegExp][] = [
  [
    "medication",
    /(dose|posologie|mg\/kg|medicament|traitement|antibio|ains|anti-inflammatoire|meloxicam|metacam|robenacoxib|buprenorphine|gabapentine|morphinique|antalgique|analges|prescri|drug|medication|dosage|antibiotic|painkiller)/,
  ],
  [
    "owner_message",
    /(proprietaire|rediger|redige|ecrire|message|expliquer|annoncer|mail|sms|whatsapp|owner|write|draft|explain|client)/,
  ],
  [
    "organization",
    /(organis|planning|agenda|rendez-vous|equipe|asv|accueil|garde|astreinte|charge de travail|retard|schedule|team|workload|front desk)/,
  ],
  [
    "wound",
    /(plaie|cicatri|suture|points|pansement|collerette|rouge|gonfl|ecoulement|incision|wound|stitches|swelling|discharge|cone)/,
  ],
  ["pain", /(douleur|a mal|souffr|glasgow|boite|pain|limp|hurts)/],
  [
    "digestive",
    /(vomi|diarrh|mange (pas|plus)|ne mange|anorexi|appetit|boit (pas|plus)|vomit|not eating|appetite|diarrh)/,
  ],
  [
    "case_review",
    /(dossier|point sur|resume|synthese|ou en est|comment va|que faire|prise en charge|suivi|case|update|summary|how is)/,
  ],
  ["greeting", /^(bonjour|salut|hello|hi|coucou|bonsoir)\b/],
];

const SPECIES = {
  fr: { dog: "chien", cat: "chat" },
  en: { dog: "dog", cat: "cat" },
} as const;

const TRIAGE = {
  fr: { normal: "normale", watch: "à surveiller", urgent: "urgente" },
  en: { normal: "normal", watch: "watch", urgent: "urgent" },
} as const;

function topicOf(text: string): Topic | null {
  for (const [topic, pattern] of TOPICS) if (pattern.test(text)) return topic;
  return null;
}

/** Ce que le dossier contient vraiment, en quelques lignes. */
function caseLines(language: "fr" | "en", file: StiveCase): string[] {
  const species = SPECIES[language][file.species];
  const clinical = file.clinical;
  if (!clinical)
    return [
      language === "en"
        ? `I can see ${file.animal}'s file (${species}), but without clinical access: I don't have the procedure, the conversation or the treatments.`
        : `Je vois le dossier de ${file.animal} (${species}), mais sans accès clinique : je n'ai ni l'intervention, ni la conversation, ni les traitements.`,
    ];
  const lines: string[] = [];
  const triage = TRIAGE[language][clinical.triage];
  lines.push(
    language === "en"
      ? `${file.animal} (${species}) — ${clinical.procedure}, day ${clinical.dayNumber}, current priority: ${triage}.`
      : `${file.animal} (${species}) — ${clinical.procedure}, J+${clinical.dayNumber}, priorité actuelle : ${triage}.`,
  );
  if (clinical.openAlerts.length > 0)
    lines.push(
      language === "en"
        ? `${clinical.openAlerts.length} alert(s) still open in the file.`
        : `${clinical.openAlerts.length} alerte(s) encore ouverte(s) dans le dossier.`,
    );
  if (clinical.treatments.length > 0)
    lines.push(
      (language === "en"
        ? "Treatments in the file: "
        : "Traitements au dossier : ") +
        clinical.treatments
          .map(
            (treatment) =>
              `${treatment.name}${treatment.validated ? "" : language === "en" ? " (not validated yet)" : " (pas encore validé)"}`,
          )
          .join(", ") +
        ".",
    );
  if (clinical.allergies.length > 0)
    lines.push(
      (language === "en" ? "Recorded allergies: " : "Allergies notées : ") +
        clinical.allergies.join(", ") +
        ".",
    );
  const lastOwner = [...clinical.recentExchanges]
    .reverse()
    .find((exchange) => exchange.from === "owner" && exchange.text);
  if (lastOwner)
    lines.push(
      language === "en"
        ? `Last owner message (day ${lastOwner.dayNumber}): "${lastOwner.text.slice(0, 220)}"`
        : `Dernier message du propriétaire (J+${lastOwner.dayNumber}) : « ${lastOwner.text.slice(0, 220)} »`,
    );
  return lines;
}

const ADVICE: Record<"fr" | "en", Record<Topic | "default", string>> = {
  fr: {
    greeting:
      "Bonjour ! Je suis Stive, votre assistant IA. Je peux vous aider à réfléchir à un cas, préparer un message pour un propriétaire, faire le point sur un suivi ou organiser la journée du cabinet. De quoi voulez-vous parler ?",
    medication:
      "Pour un choix de molécule ou une dose, je vous propose de partir de la référence (RCP, formulaire du cabinet ou protocole validé), du poids à jour et des contre-indications (fonction rénale et hépatique, association AINS et corticoïdes, âge). Je peux vous aider à comparer des options ou à rédiger les consignes pour le propriétaire, mais la prescription reste votre décision.",
    owner_message:
      "Voici une trame de message, à adapter :\n« Bonjour, je reviens vers vous au sujet de [animal]. D'après ce que vous nous décrivez, [observation]. Je vous propose [conduite à tenir : surveiller tel signe, venir en contrôle, appeler le cabinet si…]. N'hésitez pas à nous écrire si quelque chose vous inquiète. »\nPhrases courtes, une seule consigne par message et un critère clair pour rappeler le cabinet : c'est ce qui marche le mieux.",
    organization:
      "Quelques pistes simples : regrouper les contrôles post-opératoires sur des créneaux dédiés, laisser Numa prendre les nouvelles de routine et ne traiter vous-même que les alertes, et confier aux ASV les rappels de rendez-vous. Dites-moi ce qui coince aujourd'hui (agenda, appels, urgences imprévues) et je vous propose une organisation concrète.",
    wound:
      "Pour une plaie opératoire, les points à vérifier : aspect des berges, rougeur ou chaleur qui s'étendent, écoulement (aspect, odeur), œdème, léchage malgré la collerette, et l'état général (appétit, température). Une photo à la lumière du jour, comparée à la précédente, aide beaucoup ; un écoulement purulent, une déhiscence ou une hyperthermie justifient de revoir l'animal rapidement.",
    pain: "Pour objectiver la douleur, une grille validée (Glasgow composite pour le chien, Feline Grimace Scale pour le chat) permet de suivre l'évolution d'un jour à l'autre. Côté propriétaire : posture voûtée, refus de bouger, léchage insistant de la zone, vocalises ou agressivité inhabituelle. L'ajustement de l'analgésie reste à votre appréciation après examen.",
    digestive:
      "Pour un trouble digestif après une intervention, je regarderais la durée et la fréquence, la présence de sang, l'hydratation, l'abattement et un éventuel lien avec un traitement en cours (AINS notamment). Des vomissements répétés, une anorexie de plus de 24 à 48 heures ou un abattement marqué justifient un examen.",
    case_review:
      "Pour aller plus loin, je peux vous proposer les points à vérifier au prochain contrôle, une trame de message pour le propriétaire, ou une liste de questions à lui poser.",
    default:
      "Je peux vous aider sur ce sujet. Pour vous répondre précisément, dites-m'en un peu plus : l'animal concerné (vous pouvez choisir son dossier au-dessus de la zone de saisie), ce que vous avez observé et ce que vous cherchez à décider.",
  },
  en: {
    greeting:
      "Hello! I'm Stive, your AI assistant. I can help you think through a case, draft a message for an owner, review a follow-up or organise the practice's day. What would you like to talk about?",
    medication:
      "For a choice of drug or a dose, I'd start from the reference (SPC, practice formulary or validated protocol), the current weight and the contraindications (renal and hepatic function, NSAID and steroid combinations, age). I can help you compare options or write the owner's instructions, but the prescription remains your decision.",
    owner_message:
      'Here is a template to adapt:\n"Hello, I\'m getting back to you about [animal]. From what you describe, [observation]. I suggest [what to do: watch for a given sign, come in for a check-up, call the practice if…]. Feel free to write to us if anything worries you."\nShort sentences, one instruction per message and a clear criterion for calling the practice work best.',
    organization:
      "A few simple ideas: group post-operative check-ups into dedicated slots, let Numa handle routine check-ins so you only deal with alerts, and hand appointment reminders to the nurses. Tell me what is getting in the way today (schedule, calls, unexpected emergencies) and I'll suggest a concrete plan.",
    wound:
      "For a surgical wound, the points to check: wound edges, spreading redness or heat, discharge (appearance, smell), swelling, licking despite the cone, and general condition (appetite, temperature). A daylight photo compared with the previous one helps a lot; purulent discharge, dehiscence or fever justify seeing the animal quickly.",
    pain: "To assess pain objectively, a validated scale (Glasgow composite for dogs, Feline Grimace Scale for cats) lets you track changes day by day. Owner-visible signs: hunched posture, reluctance to move, persistent licking of the area, vocalising or unusual aggression. Adjusting analgesia remains your call after examination.",
    digestive:
      "For a digestive problem after a procedure, I'd look at duration and frequency, blood, hydration, lethargy and a possible link with current treatment (NSAIDs in particular). Repeated vomiting, anorexia beyond 24 to 48 hours or marked lethargy justify an examination.",
    case_review:
      "To go further, I can suggest what to check at the next appointment, a message template for the owner, or a list of questions to ask them.",
    default:
      "I can help with that. To answer precisely, tell me a bit more: the animal concerned (you can pick its file above the message box), what you observed and what you need to decide.",
  },
};

const URGENT_FIRST = {
  fr: "Ce que vous décrivez peut relever de l'urgence : si l'animal est concerné en ce moment, il faut le voir sans attendre (ou orienter le propriétaire vers le service de garde). Je reste disponible pour la suite, mais ne retardez pas l'examen.",
  en: "What you describe may be an emergency: if the animal is affected right now, it needs to be seen without delay (or the owner directed to the on-call service). I'm here for the rest, but don't delay the examination.",
};

const SIMULATED = {
  fr: "(Réponse simulée : en local, Stive n'utilise pas de vrai modèle d'IA.)",
  en: "(Simulated reply: locally, Stive does not use a real AI model.)",
};

export function simulatedStiveReply(input: StiveChatInput): { text: string } {
  const language = input.language;
  const last = [...input.turns].reverse().find((turn) => turn.from === "vet");
  const text = foldText(last?.text ?? "").trim();
  const parts: string[] = [];
  if (URGENT.test(text)) parts.push(URGENT_FIRST[language]);
  const topic = topicOf(text);
  if (input.case) {
    const lines = caseLines(language, input.case);
    parts.push(
      (language === "en"
        ? "Here is what the practice's file contains:\n"
        : "Voici ce que contient le dossier du cabinet :\n") +
        lines.map((line) => `• ${line}`).join("\n"),
    );
  }
  if (topic !== "greeting" || parts.length === 0)
    parts.push(
      ADVICE[language][topic ?? (input.case ? "case_review" : "default")],
    );
  parts.push(SIMULATED[language]);
  return { text: parts.join("\n\n") };
}
