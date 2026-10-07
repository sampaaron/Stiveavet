import type { EmailMessage } from "@/adapters/email/types";
import { TRIAL_MONTHLY_CENTS, TRIAL_MONTHS } from "@/domains/facturation/rules";
import { formatPrice } from "@/i18n/locales";
import type { Locale } from "@/i18n/locales";
import { pathFor } from "@/i18n/routes";
import type { SitePage } from "@/i18n/routes";

/**
 * Séquence envoyée après une demande de démo (cahier des charges §13) : cinq e-mails sur deux
 * semaines, arrêtée dès que l'essai démarre, désinscription possible à tout moment.
 * Ces e-mails ne contiennent jamais de donnée clinique (architecture §10).
 */
export const DEMO_SEQUENCE_DAYS = [0, 2, 5, 9, 13] as const;
export type DemoStep = 1 | 2 | 3 | 4 | 5;

export function isDemoStep(value: number): value is DemoStep {
  return (
    Number.isInteger(value) && value >= 1 && value <= DEMO_SEQUENCE_DAYS.length
  );
}

type Block =
  string | { label: string; page: SitePage } | { label: string; url: string };

type Template = { subject: string; blocks: Block[] };

export type DemoEmailContext = {
  locale: Locale;
  cabinetName: string;
  appUrl: string;
  /** Lien d'accès direct à la démo (premier e-mail, s'il est envoyé à la demande). */
  accessUrl?: string;
  /** Page de désinscription (un bouton à confirmer : un simple affichage ne désinscrit pas). */
  unsubscribeUrl: string;
  /** Désinscription en un clic par la messagerie (RFC 8058), en POST uniquement. */
  oneClickUnsubscribeUrl: string;
};

function templates(
  locale: Locale,
  cabinetName: string,
  accessUrl?: string,
): Record<DemoStep, Template> {
  const trial = formatPrice(TRIAL_MONTHLY_CENTS, locale);
  if (locale === "en")
    return {
      1: {
        subject: "Your Stivea Vet demo is ready",
        blocks: [
          "Hello,",
          `Thank you for your interest. The Stivea Vet demo for ${cabinetName} is open for 14 days.`,
          accessUrl
            ? { label: "Open the demo", url: accessUrl }
            : { label: "Request access to the demo again", page: "demo" },
          "Everything in it is fictional: the practice, the animals, the owners and the conversations. No real WhatsApp, no dr.veto connection.",
          "Over the next two weeks we will send you four short e-mails about how Stivea Vet works. You can unsubscribe at any time.",
        ],
      },
      2: {
        subject: "How Numa follows up with an owner after a procedure",
        blocks: [
          "Hello,",
          "Numa is an AI assistant. She writes to the owner from your practice's WhatsApp Business number, introduces herself as an AI in the very first message and asks for consent before any follow-up.",
          "She follows the protocol you approved: questions, reminders, warning signs. She never diagnoses and never changes a treatment.",
          "You can take over the conversation at any time: Numa then pauses until you click “Resume Numa”.",
          { label: "See how it works", page: "how" },
        ],
      },
      3: {
        subject: "Emergencies: Numa alerts, you decide",
        blocks: [
          "Hello,",
          "Every message is sorted into three levels: normal, to watch, urgent. When in doubt, Numa escalates.",
          "In an emergency, Numa immediately gives the owner your practice's emergency instructions and contacts, including at night, at weekends and on public holidays, and alerts you on your professional number.",
          "Without an acknowledgement, the other vets are alerted after the delay you choose, between 3 and 5 hours.",
          "The medical decision always stays with you.",
        ],
      },
      4: {
        subject: "Your team, your permissions, your data",
        blocks: [
          "Hello,",
          "Everyone has their own account: admin vet, vet, assistant. A file can be private, then shared with a colleague when needed.",
          "Every important action is recorded in an activity log.",
          "Data is hosted in Europe, kept for one year at most and never used to train an external AI model.",
          { label: "Read the security page", page: "security" },
        ],
      },
      5: {
        subject: `Start the pilot trial at ${trial} excl. VAT`,
        blocks: [
          "Hello,",
          `The pilot trial lasts ${TRIAL_MONTHS} months at ${trial} excl. VAT per month, in real use and without commitment: you can stop it at any time.`,
          "Afterwards you move to the plan chosen at sign-up. No annual commitment is ever created automatically during the first six months.",
          "The guided setup is designed to take between 5 and 15 minutes.",
          { label: `Start the trial at ${trial} excl. VAT`, page: "trial" },
          "This is the last e-mail of this series.",
        ],
      },
    };

  return {
    1: {
      subject: "Votre démo Stivea Vet est prête",
      blocks: [
        "Bonjour,",
        `Merci pour votre intérêt. La démo de Stivea Vet pour ${cabinetName} est ouverte pendant 14 jours.`,
        accessUrl
          ? { label: "Ouvrir la démo", url: accessUrl }
          : { label: "Redemander l'accès à la démo", page: "demo" },
        "Tout y est fictif : le cabinet, les animaux, les propriétaires et les conversations. Aucun WhatsApp réel, aucune connexion dr.veto.",
        "Dans les deux prochaines semaines, nous vous enverrons quatre e-mails courts sur le fonctionnement de Stivea Vet. Vous pouvez vous désinscrire à tout moment.",
      ],
    },
    2: {
      subject: "Comment Numa accompagne un propriétaire après une intervention",
      blocks: [
        "Bonjour,",
        "Numa est une assistante IA. Elle écrit au propriétaire depuis le numéro WhatsApp Business de votre cabinet, se présente comme une IA dès le premier message et demande son accord avant tout suivi.",
        "Elle suit le protocole que vous avez validé : questions, rappels, signes d'alerte. Elle ne pose aucun diagnostic et ne modifie jamais un traitement.",
        "Vous pouvez reprendre la conversation à tout moment : Numa se met alors en pause jusqu'à ce que vous cliquiez sur « Reprendre Numa ».",
        { label: "Voir le fonctionnement", page: "how" },
      ],
    },
    3: {
      subject: "Urgences : Numa alerte, vous décidez",
      blocks: [
        "Bonjour,",
        "Chaque message est classé en trois niveaux : normal, à surveiller, urgent. En cas de doute, Numa escalade.",
        "En cas d'urgence, Numa transmet tout de suite au propriétaire les consignes et coordonnées d'urgence de votre cabinet, y compris la nuit, le week-end et les jours fériés, et vous prévient sur votre numéro professionnel.",
        "Sans accusé de réception, les autres vétérinaires sont alertés après le délai que vous choisissez, entre 3 et 5 heures.",
        "La décision médicale reste toujours la vôtre.",
      ],
    },
    4: {
      subject: "Votre équipe, vos droits, vos données",
      blocks: [
        "Bonjour,",
        "Chaque personne a son compte : vétérinaire administrateur, vétérinaire, assistant. Un dossier peut être privé, puis partagé ponctuellement avec un confrère.",
        "Toutes les actions importantes sont tracées dans un journal d'activité.",
        "Les données sont hébergées en Europe, conservées un an au maximum et ne servent jamais à entraîner un modèle d'IA externe.",
        { label: "Lire la page sécurité", page: "security" },
      ],
    },
    5: {
      subject: `Démarrer l'essai pilote à ${trial} HT`,
      blocks: [
        "Bonjour,",
        `L'essai pilote dure ${TRIAL_MONTHS} mois à ${trial} HT par mois, en usage réel et sans engagement : vous pouvez l'arrêter à tout moment.`,
        "Ensuite, vous passez à la formule choisie à l'inscription. Aucun engagement annuel n'est créé automatiquement pendant les six premiers mois.",
        "L'installation guidée est pensée pour prendre entre 5 et 15 minutes.",
        { label: `Commencer l'essai à ${trial} HT`, page: "trial" },
        "C'est le dernier e-mail de cette série.",
      ],
    },
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function demoEmail(
  to: string,
  step: DemoStep,
  context: DemoEmailContext,
): EmailMessage {
  const { locale, appUrl, unsubscribeUrl } = context;
  if (!isDemoStep(step)) throw new Error("Étape de séquence inconnue");
  const { subject, blocks } = templates(
    locale,
    context.cabinetName,
    context.accessUrl,
  )[step];
  const signature =
    locale === "en" ? "The Stivea Vet team" : "L'équipe Stivea Vet";
  const footer =
    locale === "en"
      ? `You are receiving this e-mail because a Stivea Vet demo was requested with this address. Unsubscribe in one click: ${unsubscribeUrl}`
      : `Vous recevez cet e-mail parce qu'une démo de Stivea Vet a été demandée avec cette adresse. Se désinscrire en un clic : ${unsubscribeUrl}`;

  const links = blocks.map((block) =>
    typeof block === "string"
      ? block
      : {
          label: block.label,
          url:
            "url" in block
              ? block.url
              : new URL(pathFor(block.page, locale), appUrl).toString(),
        },
  );

  return {
    to,
    subject,
    text: [
      ...links.map((block) =>
        typeof block === "string" ? block : `${block.label} : ${block.url}`,
      ),
      "",
      signature,
      "",
      footer,
    ].join("\n"),
    html: [
      ...links.map((block) =>
        typeof block === "string"
          ? `<p>${escapeHtml(block)}</p>`
          : `<p><a href="${escapeHtml(block.url)}">${escapeHtml(block.label)}</a></p>`,
      ),
      `<p>${escapeHtml(signature)}</p>`,
      `<p style="color:#5b6779;font-size:12px">${escapeHtml(footer)}</p>`,
    ].join(""),
    headers: {
      "List-Unsubscribe": `<${context.oneClickUnsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
