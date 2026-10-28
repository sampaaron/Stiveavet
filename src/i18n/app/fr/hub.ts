/** Pages ajoutées par la refonte du menu (ADR 0044) : assistants, raccourcis, intégrations, contenus. */
export const hub = {
  assistants: {
    title: "Assistants IA",
    description:
      "Les deux assistants IA du cabinet : à qui chacun parle, ce qu'il fait et ce qu'il ne fait jamais.",
    numa: {
      talksTo: "Parle aux propriétaires, dans les suivis",
      doesTitle: "Ce qu'elle fait",
      does: [
        "Envoie les messages du protocole, dans vos horaires d'envoi.",
        "Recueille les réponses, les photos et les messages vocaux.",
        "Prévient l'équipe dès qu'une réponse inquiète.",
      ],
      neverTitle: "Ce qu'elle ne fait jamais",
      never: [
        "Poser un diagnostic ou conseiller un traitement.",
        "Se faire passer pour une personne.",
      ],
      settings: "Régler Numa",
      followups: "Voir les suivis",
    },
    stive: {
      talksTo: "Aide l'équipe du cabinet",
      doesTitle: "Ce qu'il fait",
      does: [
        "Prépare le point du jour et résume un dossier.",
        "Rédige des brouillons de messages, que vous relisez.",
        "Cherche vos créneaux libres et les rendez-vous à confirmer.",
      ],
      neverTitle: "Ce qu'il ne fait jamais",
      never: [
        "Envoyer ou modifier quoi que ce soit sans votre clic.",
        "Donner un diagnostic ou un dosage.",
      ],
      usageLabel: "Vos demandes ce mois-ci",
      usage: (used: number, limit: number) => `${used} sur ${limit}`,
      open: "Parler à Stive",
      notIncluded: "Stive n'est pas ouvert pour votre compte.",
      seeOffer: "Découvrir Stive",
    },
  },
  shortcuts: {
    title: "Raccourcis",
    description:
      "Des demandes toutes prêtes pour Stive, en un clic. Sa réponse s'ouvre dans votre conversation ; rien ne part sans votre accord.",
    run: "Demander à Stive",
    runLabel: (title: string) => `Demander à Stive : ${title}`,
    groups: {
      day: "Ma journée",
      agenda: "Agenda",
      files: "Dossiers et messages",
    },
    /** `question` : le texte envoyé tel quel à Stive. */
    items: {
      briefing: {
        title: "Mon point du jour",
        text: "Ce qui attend une décision aujourd'hui.",
        question: "Mon point du jour",
      },
      appointments: {
        title: "Rendez-vous à confirmer",
        text: "Les demandes de rendez-vous des propriétaires.",
        question: "Rendez-vous à confirmer",
      },
      slots: {
        title: "Mes créneaux libres demain",
        text: "Pour caler un contrôle.",
        question: "Mes créneaux libres demain",
      },
      teamSlots: {
        title: "Les créneaux de l'équipe",
        text: "Les créneaux libres de chaque vétérinaire cette semaine.",
        question: "Les créneaux libres de toute l'équipe cette semaine",
      },
      summary: {
        title: "Résumer un dossier",
        text: "Stive vous demande lequel, puis le résume.",
        question: "Résumé d'un dossier",
      },
      news: {
        title: "Prendre des nouvelles",
        text: "Un brouillon de message pour un propriétaire.",
        question: "Brouillon de message pour prendre des nouvelles",
      },
      photo: {
        title: "Demander une photo",
        text: "Un brouillon pour obtenir une photo récente de l'animal.",
        question: "Brouillon de message pour demander une photo",
      },
      call: {
        title: "Demander d'appeler le cabinet",
        text: "Un brouillon pour inviter le propriétaire à appeler.",
        question: "Brouillon de message pour demander d'appeler le cabinet",
      },
    },
    notIncluded:
      "Les raccourcis demandent Stive, qui n'est pas compris dans la formule du cabinet.",
  },
  integrations: {
    title: "Intégrations",
    description:
      "Les services reliés à Stivea Vet et leur état. Tant que les comptes du cabinet ne sont pas ouverts, les branchements fonctionnent en simulation.",
    ai: {
      title: "Assistants IA",
      description:
        "Le fournisseur qui fait parler Numa et Stive, sans entraînement sur vos données.",
      simulated:
        "Réponses écrites d'avance : aucun texte ne quitte Stivea Vet.",
      connected: (provider: string) => `Branché : ${provider}.`,
      providers: { scaleway: "Scaleway (Paris)", mistral: "Mistral AI" },
    },
  },
  contents: {
    title: "Contenus",
    description:
      "Les brouillons que Stive a rédigés pour vous ces 30 derniers jours. Ils ne partent qu'une fois relus et envoyés depuis le dossier.",
    draftTitle: (recipients: string, animal: string) =>
      `Message à ${recipients}, pour ${animal}`,
    status: {
      open: "À relire",
      done: "Utilisé",
      expired: "Expiré",
    },
    use: "Reprendre dans le dossier",
    createdAt: (when: string) => `Rédigé ${when}`,
    empty: {
      title: "Aucun brouillon pour l'instant",
      description:
        "Demandez à Stive un message pour un propriétaire : il apparaîtra ici.",
      action: "Voir les raccourcis",
    },
    privacy:
      "Vos brouillons ne sont visibles que par vous ; ils sont effacés avec votre conversation après 30 jours.",
  },
};
