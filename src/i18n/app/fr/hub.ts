/** Pages ajoutées par la refonte du menu (ADR 0044) : assistants, raccourcis, intégrations, documents, contenus. */
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
  documents: {
    title: "Documents",
    description:
      "La bibliothèque du cabinet : fiches de consignes remises aux propriétaires, procédures internes, documents administratifs.",
    notice:
      "Pas de dossier patient ici : ces documents sont visibles par toute l'équipe qui voit les protocoles.",
    categories: {
      owner_sheet: "Fiche pour les propriétaires",
      procedure: "Procédure interne",
      admin: "Administratif",
      other: "Autre",
    },
    count: (n: number) =>
      n === 0 ? "Aucun document" : n === 1 ? "1 document" : `${n} documents`,
    added: (when: string, by: string | null) =>
      by ? `Ajouté ${when} par ${by}` : `Ajouté ${when}`,
    open: "Ouvrir",
    download: "Télécharger",
    openLabel: (title: string) => `Ouvrir ${title}`,
    downloadLabel: (title: string) => `Télécharger ${title}`,
    missing: "Fichier d'exemple absent du stockage local.",
    expired:
      "Ce lien a expiré : pour votre sécurité, il ne vaut que quelques minutes. Rouvrez le document ci-dessous.",
    upload: {
      title: "Ajouter un document",
      description:
        "PDF, JPEG, PNG ou WebP, 5 Mo au plus. Les photos perdent leurs métadonnées (position, appareil).",
      titleLabel: "Titre",
      titlePlaceholder: "Consignes après stérilisation",
      categoryLabel: "Catégorie",
      fileLabel: "Fichier",
      submit: "Ajouter le document",
    },
    remove: {
      trigger: "Supprimer",
      triggerLabel: (title: string) => `Supprimer ${title}`,
      title: (title: string) => `Supprimer « ${title} » ?`,
      description:
        "Le fichier est effacé du stockage. Le journal d'activité garde la trace de la suppression.",
      confirm: "Supprimer le document",
    },
    done: {
      added: "Document ajouté.",
      removed: "Document supprimé.",
    },
    validation: {
      title: "Donnez un titre de 120 caractères au plus.",
      category: "Choisissez une catégorie.",
      file: "Choisissez un fichier.",
      tooLarge: "Ce fichier dépasse 5 Mo.",
      type: "Fichier refusé : envoyez un PDF ou une image JPEG, PNG ou WebP de 5 Mo au plus.",
    },
    empty: {
      title: "Aucun document pour l'instant",
      description:
        "Ajoutez vos fiches de consignes et vos procédures : toute l'équipe les retrouvera ici.",
      readOnly: "Les documents ajoutés par l'équipe apparaîtront ici.",
    },
  },
  /** Modèles de réponse du cabinet (ADR 0048). */
  replies: {
    title: "Réponses prêtes",
    description:
      "Les modèles de réponse du cabinet. Dans un dossier, un clic pose le texte dans la zone de saisie : vous le relisez, le corrigez puis l'envoyez vous-même.",
    notice:
      "Écrivez des phrases d'organisation, sans avis médical. Les noms sont remplacés dans le dossier : {animal}, {proprietaire}, {veterinaire}, {cabinet}.",
    count: (n: number) =>
      n === 0 ? "Aucun modèle" : `${n} modèle${n > 1 ? "s" : ""}`,
    languages: { fr: "Français", en: "Anglais" },
    empty: {
      title: "Aucun modèle pour l'instant",
      description: "Ajoutez la première réponse que l'équipe écrit souvent.",
      readOnly:
        "L'administrateur du cabinet peut ajouter les réponses que l'équipe écrit souvent.",
    },
    updated: (when: string, by: string | null) =>
      by ? `Modifié ${when} · ajouté par ${by}` : `Modifié ${when}`,
    form: {
      addTitle: "Ajouter un modèle",
      titleLabel: "Nom du modèle",
      titlePlaceholder: "Par exemple : Message bien reçu",
      bodyLabel: "Texte",
      bodyHint:
        "1 000 caractères au plus. Champs remplacés dans le dossier : {animal}, {proprietaire}, {veterinaire}, {cabinet}.",
      languageLabel: "Langue du propriétaire",
      add: "Ajouter le modèle",
      edit: "Modifier",
      save: "Enregistrer",
    },
    remove: {
      trigger: "Supprimer",
      triggerLabel: (title: string) => `Supprimer ${title}`,
      title: (title: string) => `Supprimer « ${title} » ?`,
      description:
        "Le modèle disparaît des dossiers. Les messages déjà envoyés ne changent pas.",
      confirm: "Supprimer le modèle",
    },
    validation: {
      title: "Donnez un nom au modèle (60 caractères au plus).",
      body: "Écrivez le texte du modèle (1 000 caractères au plus).",
    },
    done: {
      added: "Modèle ajouté.",
      saved: "Modèle enregistré.",
      removed: "Modèle supprimé.",
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
