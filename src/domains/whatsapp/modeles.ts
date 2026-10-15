/**
 * Catalogue des modèles WhatsApp (ADR 0024). Hors de la fenêtre de 24 h ouverte par le
 * dernier message du propriétaire, WhatsApp n'accepte que ces textes, approuvés par Meta.
 * Le même catalogue sert à trois choses : rendre le texte gardé dans la conversation, construire
 * l'envoi à Meta, et exporter la demande d'approbation (`pnpm whatsapp:modeles`). Le texte
 * gardé est donc toujours celui qui part.
 *
 * Règles Meta suivies : catégorie « utilitaire » (aucune promotion), paramètres nommés,
 * jamais une ligne faite d'un seul paramètre, jamais de paramètre en tout début ou toute fin,
 * corps de 1 024 caractères au plus. Aucun contenu clinique, sauf `suivi_rappel`, qui porte
 * l'étape du programme validée par le vétérinaire, envoyée seulement après l'accord.
 * Textes à faire valider par le juriste avant la mise en production (cahier des charges §19).
 */

export const TEMPLATE_LANGUAGES = ["fr", "en"] as const;
export type TemplateLanguage = (typeof TEMPLATE_LANGUAGES)[number];

type Template<P extends string> = {
  /** Ce que le modèle sert à envoyer, pour la demande d'approbation. */
  purpose: string;
  params: readonly P[];
  /** Exemples exigés par Meta à la soumission (données fictives), par langue. */
  examples: Readonly<Record<TemplateLanguage, Readonly<Record<P, string>>>>;
  text: Readonly<Record<TemplateLanguage, string>>;
};

const EXAMPLES = {
  fr: {
    first_name: "Margaux",
    other_first_name: "Julien",
    practice: "Clinique vétérinaire des Tilleuls",
    vet: "Dr Claire Fontaine",
    animal: "Caramel",
    date: "lundi 12 octobre à 14:30",
    message:
      "Pensez à retirer la collerette pour le repas de ce soir, puis à la remettre.",
  },
  en: {
    first_name: "Olivia",
    other_first_name: "James",
    practice: "Clinique vétérinaire des Tilleuls",
    vet: "Dr Claire Fontaine",
    animal: "Hazel",
    date: "Monday 12 October at 2:30 pm",
    message:
      "Remember to take the cone off for tonight's meal, then put it back on.",
  },
} as const;
type ParamName = keyof (typeof EXAMPLES)["fr"];

function template<P extends ParamName>(
  purpose: string,
  params: readonly P[],
  text: Record<TemplateLanguage, string>,
): Template<P> {
  const examplesIn = (language: TemplateLanguage) => {
    const values = {} as Record<P, string>;
    for (const name of params) values[name] = EXAMPLES[language][name];
    return values;
  };
  return {
    purpose,
    params,
    examples: { fr: examplesIn("fr"), en: examplesIn("en") },
    text,
  };
}

const CONSENT_FR =
  "Je ne pose pas de diagnostic et je ne modifie aucun traitement : toute décision médicale reste au vétérinaire, qui lit nos échanges.";
const CONSENT_EN =
  "I do not make diagnoses or change any treatment: every medical decision stays with the vet, who reads our messages.";
const ASK_FR =
  "Répondez OUI pour accepter ce suivi sur WhatsApp. Vous pourrez écrire STOP à tout moment pour l'arrêter.";
const ASK_EN =
  "Reply YES to accept this follow-up on WhatsApp. You can write STOP at any time to end it.";
const INTRO_FR =
  "Bonjour {{first_name}}, je suis Numa, l'assistante IA (intelligence artificielle) de {{practice}}. Comme convenu avec vous au cabinet, {{vet}} m'a demandé de prendre des nouvelles de {{animal}} après sa visite.";
const INTRO_EN =
  "Hello {{first_name}}, I'm Numa, the AI (artificial intelligence) assistant of {{practice}}. As agreed with you at the clinic, {{vet}} asked me to check on {{animal}} after the visit.";

export const TEMPLATES = {
  suivi_premier_message: template(
    "Premier message d'un suivi post-consultation, après l'accord donné au cabinet : demande l'accord au suivi sur WhatsApp.",
    ["first_name", "practice", "vet", "animal"],
    {
      fr: `${INTRO_FR}\n\n${CONSENT_FR}\n\n${ASK_FR}`,
      en: `${INTRO_EN}\n\n${CONSENT_EN}\n\n${ASK_EN}`,
    },
  ),
  suivi_premier_message_groupe: template(
    "Premier message quand deux propriétaires suivent l'animal et qu'un groupe dédié sera créé.",
    ["first_name", "practice", "vet", "animal", "other_first_name"],
    {
      fr: `${INTRO_FR}\n\n${CONSENT_FR}\n\nCe suivi est proposé aussi à {{other_first_name}}. Si vous l'acceptez tous les deux, je créerai un groupe WhatsApp dédié au suivi de {{animal}} : vous y verrez tous les deux les messages, les vôtres comme les miens.\n\n${ASK_FR}`,
      en: `${INTRO_EN}\n\n${CONSENT_EN}\n\nThis follow-up is also offered to {{other_first_name}}. If you both accept, I will create a WhatsApp group dedicated to {{animal}}'s follow-up: you will both see all messages there, yours and mine.\n\n${ASK_EN}`,
    },
  ),
  suivi_premier_message_deux: template(
    "Premier message quand deux propriétaires suivent l'animal, chacun dans sa propre conversation.",
    ["first_name", "practice", "vet", "animal", "other_first_name"],
    {
      fr: `${INTRO_FR}\n\n${CONSENT_FR}\n\nCe suivi est proposé aussi à {{other_first_name}}. Chacun de vous recevra mes messages dans sa propre conversation, et l'équipe lit tous les échanges.\n\n${ASK_FR}`,
      en: `${INTRO_EN}\n\n${CONSENT_EN}\n\nThis follow-up is also offered to {{other_first_name}}. Each of you will receive my messages in your own conversation, and the team reads every message.\n\n${ASK_EN}`,
    },
  ),
  suivi_nouvelles: template(
    "Prise de nouvelles prévue au programme du suivi, quand le texte rédigé n'est pas utilisable.",
    ["animal", "practice"],
    {
      fr: "Bonjour, comment va {{animal}} ? Vous pouvez me répondre ici : l'équipe de {{practice}} lira votre message. En cas d'urgence, appelez directement le cabinet.",
      en: "Hello, how is {{animal}} doing? You can reply here: the {{practice}} team will read your message. In an emergency, call the clinic directly.",
    },
  ),
  suivi_rappel: template(
    "Étape du programme de suivi validé par le vétérinaire, envoyée à l'heure prévue après l'accord du propriétaire.",
    ["first_name", "animal", "practice", "message"],
    {
      fr: "Bonjour {{first_name}}, voici le point de suivi de {{animal}} préparé par Numa, l'assistante IA de {{practice}} : {{message}}\n\nVous pouvez répondre ici. En cas d'urgence, appelez directement le cabinet.",
      en: "Hello {{first_name}}, here is {{animal}}'s follow-up update from Numa, the AI assistant of {{practice}}: {{message}}\n\nYou can reply here. In an emergency, call the clinic directly.",
    },
  ),
  suivi_cloture: template(
    "Fin du suivi automatisé à la date du rendez-vous de contrôle.",
    ["animal", "practice"],
    {
      fr: "Le suivi de {{animal}} prévu par {{practice}} se termine aujourd'hui, date du rendez-vous de contrôle. Je ne vous enverrai plus de message de suivi. Cette conversation reste ouverte : si vous m'écrivez, je transmets votre message à l'équipe. En cas d'urgence, appelez directement le cabinet.",
      en: "The follow-up of {{animal}} planned by {{practice}} ends today, the date of the check-up. I won't send you any more follow-up messages. This conversation stays open: if you write to me, I'll pass your message on to the team. In an emergency, call the clinic directly.",
    },
  ),
  suivi_arret_autre: template(
    "Prévient un propriétaire que l'autre propriétaire a arrêté le suivi.",
    ["other_first_name", "animal", "practice"],
    {
      fr: "Bonjour, {{other_first_name}} a demandé l'arrêt du suivi de {{animal}} : je n'enverrai plus de message de suivi. Vous pouvez toujours écrire ici, votre message sera transmis à l'équipe de {{practice}}. En cas d'urgence, appelez directement le cabinet.",
      en: "Hello, {{other_first_name}} asked to stop {{animal}}'s follow-up: I won't send any more follow-up messages. You can still write here, your message will be passed on to the {{practice}} team. In an emergency, call the clinic directly.",
    },
  ),
  rdv_confirme: template(
    "Confirmation par le cabinet d'un rendez-vous demandé par le propriétaire.",
    ["animal", "date", "vet", "practice"],
    {
      fr: "Le rendez-vous de {{animal}} est confirmé le {{date}} avec {{vet}}. À bientôt à {{practice}}, l'équipe vous attend.",
      en: "The appointment for {{animal}} is confirmed on {{date}} with {{vet}}. See you soon at {{practice}}, the team is expecting you.",
    },
  ),
  rdv_annule: template(
    "Créneau demandé par le propriétaire que le cabinet n'a pas pu retenir.",
    ["date", "practice"],
    {
      fr: "Le créneau du {{date}} n'a pas pu être retenu. L'équipe de {{practice}} vous recontactera pour fixer un autre rendez-vous.",
      en: "The slot on {{date}} could not be kept. The {{practice}} team will contact you to set another appointment.",
    },
  ),
  message_en_attente: template(
    "Invitation à répondre quand un message du cabinet attend : il part dès la réponse du propriétaire.",
    ["first_name", "practice", "animal"],
    {
      fr: "Bonjour {{first_name}}, l'équipe de {{practice}} a un nouveau message pour vous au sujet de {{animal}}. Répondez à ce message pour le recevoir ici.",
      en: "Hello {{first_name}}, the {{practice}} team has a new message for you about {{animal}}. Reply to this message to receive it here.",
    },
  ),
  alerte_urgente: template(
    "Alerte au vétérinaire responsable ou de garde : un propriétaire a signalé une possible urgence. Aucun détail médical.",
    ["practice"],
    {
      fr: "Stivea Vet : un propriétaire suivi par {{practice}} a signalé une possible urgence. Ouvrez Stivea Vet pour la prendre en charge. Aucun détail médical n'est envoyé sur WhatsApp.",
      en: "Stivea Vet: an owner followed by {{practice}} reported a possible emergency. Open Stivea Vet to handle it. No medical details are sent on WhatsApp.",
    },
  ),
  alerte_escalade: template(
    "Escalade aux autres vétérinaires : une urgence n'a pas encore été prise en charge. Aucun détail médical.",
    ["practice"],
    {
      fr: "Stivea Vet : une urgence signalée à {{practice}} n'a pas encore été prise en charge. Ouvrez Stivea Vet pour la traiter. Aucun détail médical n'est envoyé sur WhatsApp.",
      en: "Stivea Vet: an emergency reported to {{practice}} has not been handled yet. Open Stivea Vet to deal with it. No medical details are sent on WhatsApp.",
    },
  ),
} as const;

export type TemplateKey = keyof typeof TEMPLATES;
export type TemplateParams<K extends TemplateKey> = Record<
  (typeof TEMPLATES)[K]["params"][number],
  string
>;

/** Version du catalogue : à changer à chaque modification d'un texte (nouvelle approbation). */
export const TEMPLATE_CATALOG_VERSION = "modeles-v1";

/** Longueur maximale d'un corps de modèle chez Meta. */
export const TEMPLATE_BODY_MAX = 1024;

export function isTemplateKey(value: string): value is TemplateKey {
  return Object.hasOwn(TEMPLATES, value);
}

/**
 * Valeur de paramètre acceptable par Meta : sur une ligne, sans tabulation ni longue suite
 * d'espaces (le saut de ligne appartient au texte du modèle, jamais au paramètre).
 */
export function cleanParam(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

/** Un message prêt : clé, paramètres dans l'ordre du catalogue, texte rendu. */
export type RenderedTemplate = {
  key: TemplateKey;
  params: string[];
  body: string;
};

export function renderTemplate<K extends TemplateKey>(
  key: K,
  language: TemplateLanguage,
  values: TemplateParams<K>,
): RenderedTemplate {
  const definition: Template<string> = TEMPLATES[key];
  const lookup = values as Record<string, string>;
  const params = definition.params.map((name) => {
    const value = cleanParam(lookup[name] ?? "");
    if (!value) throw new Error(`Paramètre de modèle vide : ${name}`);
    return value;
  });
  return { key, params, body: fillTemplate(key, language, params) };
}

/** Texte du modèle avec des paramètres déjà rangés (ceux gardés avec le message). */
export function fillTemplate(
  key: TemplateKey,
  language: TemplateLanguage,
  params: readonly string[],
): string {
  const definition: Template<string> = TEMPLATES[key];
  if (params.length !== definition.params.length)
    throw new Error("Nombre de paramètres de modèle invalide");
  const byName = new Map(
    definition.params.map((name, index) => [name, params[index] ?? ""]),
  );
  return definition.text[language].replace(
    /\{\{([a-z_]+)\}\}/g,
    (_, name: string) => byName.get(name) ?? "",
  );
}

/** Paramètres au format attendu par l'API de Meta (paramètres nommés). */
export function metaParameters(
  key: TemplateKey,
  params: readonly string[],
): { type: "text"; parameter_name: string; text: string }[] {
  const definition: Template<string> = TEMPLATES[key];
  return definition.params.map((name, index) => ({
    type: "text",
    parameter_name: name,
    text: params[index] ?? "",
  }));
}

/** Demandes d'approbation à soumettre à Meta, une par modèle et par langue. */
export function templateSubmissions() {
  return (Object.keys(TEMPLATES) as TemplateKey[]).flatMap((name) => {
    const definition: Template<string> = TEMPLATES[name];
    return TEMPLATE_LANGUAGES.map((language) => ({
      name,
      language,
      category: "utility" as const,
      parameter_format: "named" as const,
      purpose: definition.purpose,
      components: [
        {
          type: "body" as const,
          text: definition.text[language],
          example: {
            body_text_named_params: definition.params.map((param) => ({
              param_name: param,
              example: definition.examples[language][param] ?? "",
            })),
          },
        },
      ],
    }));
  });
}
