import type {
  CookieDuration,
  CookiePurpose,
  OptionalPurpose,
} from "@/domains/consentement/cookies";

import type { Locale } from "./locales";

/** Textes du bandeau et de la politique de cookies (ADR 0053), communs au site et à l'espace cabinet. */
type ConsentText = {
  banner: {
    label: string;
    body: string;
    refuse: string;
    accept: string;
    acceptAll: string;
    refuseAll: string;
    customize: string;
    save: string;
  };
  purposes: Record<
    "necessary" | OptionalPurpose,
    { title: string; body: string }
  >;
  alwaysOn: string;
  noToolYet: string;
  policy: {
    title: string;
    intro: string;
    choiceTitle: string;
    current: (date: string) => string;
    none: string;
    listTitle: string;
    columns: { name: string; purpose: string; duration: string };
    purposes: Record<CookiePurpose, string>;
    durations: Record<CookieDuration, string>;
    secureNote: string;
  };
};

const fr: ConsentText = {
  banner: {
    label: "Cookies",
    body: "Nous n'utilisons que les cookies nécessaires au site. Les autres restent refusés, sauf si vous les acceptez.",
    refuse: "Refuser",
    accept: "Accepter",
    acceptAll: "Tout accepter",
    refuseAll: "Tout refuser",
    customize: "Personnaliser",
    save: "Enregistrer mes choix",
  },
  purposes: {
    necessary: {
      title: "Nécessaires",
      body: "Connexion sécurisée, langue et mode d'affichage. Sans eux, le site ne fonctionne pas.",
    },
    audience: {
      title: "Mesure d'audience",
      body: "Compter les visites pour améliorer le site, sans vous identifier.",
    },
    marketing: {
      title: "Marketing",
      body: "Mesurer l'efficacité de nos annonces sur d'autres sites.",
    },
  },
  alwaysOn: "Toujours actifs",
  noToolYet:
    "Aucun outil n'est branché aujourd'hui : rien n'est déposé, même si vous acceptez.",
  policy: {
    title: "Politique de cookies",
    intro:
      "Un cookie est un petit fichier enregistré par votre navigateur. Voici ceux que dépose Stivea Vet, à quoi ils servent et combien de temps ils restent. Votre choix vaut six mois, puis nous vous le redemandons.",
    choiceTitle: "Votre choix",
    current: (date) =>
      `Choix enregistré le ${date}. Vous pouvez le changer ici à tout moment.`,
    none: "Vous n'avez pas encore fait de choix : seuls les cookies nécessaires sont déposés.",
    listTitle: "Cookies déposés",
    columns: { name: "Nom", purpose: "À quoi il sert", duration: "Durée" },
    purposes: {
      session: "Garder votre session ouverte dans l'espace cabinet.",
      device:
        "Reconnaître un appareil où vous avez déjà saisi le code de sécurité.",
      challenge:
        "Relier le code de sécurité reçu par e-mail à votre connexion en cours.",
      demo: "Ouvrir l'espace de démonstration, avec ses données fictives.",
      lang: "Retenir la langue de l'espace cabinet.",
      mode: "Retenir le mode d'affichage (clair, sombre ou automatique).",
      consent: "Retenir votre choix sur les cookies.",
    },
    durations: {
      session: "12 heures au plus",
      device: "90 jours",
      challenge: "10 minutes",
      demo: "14 jours",
      year: "1 an",
      consent: "6 mois",
    },
    secureNote:
      "En HTTPS, chaque nom commence par « __Host- ». Ces cookies ne sont lisibles que par Stivea Vet et jamais par une autre adresse.",
  },
};

const en: ConsentText = {
  banner: {
    label: "Cookies",
    body: "We only use the cookies the site needs. Any others stay refused unless you accept them.",
    refuse: "Refuse",
    accept: "Accept",
    acceptAll: "Accept all",
    refuseAll: "Refuse all",
    customize: "Customise",
    save: "Save my choices",
  },
  purposes: {
    necessary: {
      title: "Necessary",
      body: "Secure sign-in, language and display mode. The site does not work without them.",
    },
    audience: {
      title: "Audience measurement",
      body: "Count visits to improve the site, without identifying you.",
    },
    marketing: {
      title: "Marketing",
      body: "Measure how well our adverts work on other sites.",
    },
  },
  alwaysOn: "Always on",
  noToolYet: "No tool is connected today: nothing is set, even if you accept.",
  policy: {
    title: "Cookie policy",
    intro:
      "A cookie is a small file saved by your browser. Here are the ones Stivea Vet sets, what they are for and how long they last. Your choice is kept for six months, then we ask again.",
    choiceTitle: "Your choice",
    current: (date) =>
      `Choice saved on ${date}. You can change it here at any time.`,
    none: "You have not chosen yet: only the necessary cookies are set.",
    listTitle: "Cookies set",
    columns: { name: "Name", purpose: "What it is for", duration: "Duration" },
    purposes: {
      session: "Keep you signed in to the practice workspace.",
      device:
        "Recognise a device where you have already entered the security code.",
      challenge:
        "Link the security code sent by email to your current sign-in.",
      demo: "Open the demo workspace and its fictional data.",
      lang: "Remember the language of the practice workspace.",
      mode: "Remember the display mode (light, dark or automatic).",
      consent: "Remember your cookie choice.",
    },
    durations: {
      session: "12 hours at most",
      device: "90 days",
      challenge: "10 minutes",
      demo: "14 days",
      year: "1 year",
      consent: "6 months",
    },
    secureNote:
      "Over HTTPS, every name starts with “__Host-”. Only Stivea Vet can read these cookies, never another address.",
  },
};

export function consentText(locale: Locale): ConsentText {
  return locale === "en" ? en : fr;
}
