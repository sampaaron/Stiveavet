import { nombre } from "@/i18n/pluriel";

/** Stive, l'assistant IA de l'équipe (lot 29, ADR 0034). Toujours présenté comme une IA. */
export const stive = {
  title: "Stive",
  eyebrow: "Assistants IA",
  description:
    "Stive prépare, vous décidez : aucune action réelle sans votre confirmation.",
  aiNotice:
    "Stive est une IA. Il ne pose aucun diagnostic, ne donne aucun dosage et peut se tromper : vérifiez ses réponses dans le dossier.",
  thread: "Échanges avec Stive",
  you: "Vous",
  greeting: (firstName: string) =>
    `Bonjour ${firstName}, que puis-je préparer pour vous ?`,
  greetingHelp:
    "Posez une question avec vos mots, ou choisissez une suggestion.",
  greetingHelpAi:
    "Parlez-moi comme à un collègue : le métier, vos dossiers, vos clients, l'organisation du cabinet. Je prépare, vous décidez.",
  /** Mode de Stive (ADR 0042). */
  mode: {
    simulatedTitle: "Mode simulé",
    simulated:
      "Stive ne reconnaît ici que six demandes, par des règles écrites. Pour discuter librement du métier, il faut brancher l'IA : variable AI_PROVIDER et clé AI_API_KEY dans le fichier .env du serveur, jamais dans le code.",
  },
  thinking: "Stive réfléchit…",
  ask: {
    label: "Votre demande à Stive",
    placeholder: "Par exemple : mes créneaux libres demain",
    placeholderAi:
      "Par exemple : comment annoncer une complication à un propriétaire inquiet ?",
    submit: "Demander",
    empty: "Écrivez votre demande avant de l'envoyer.",
    tooLong: "Votre demande est trop longue (500 caractères au plus).",
    suggestions: "Suggestions",
  },
  /** Demandes proposées en un clic ; le texte est envoyé tel quel à Stive. */
  suggestions: {
    briefing: "Mon point du jour",
    slots: "Mes créneaux libres demain",
    appointments: "Rendez-vous à confirmer",
    summary: (animal: string) => `Résumé du dossier de ${animal}`,
    draftNews: (animal: string) =>
      `Brouillon de message pour prendre des nouvelles de ${animal}`,
    draftPhoto: (animal: string) =>
      `Brouillon de message pour demander une photo de ${animal}`,
    pause: (animal: string) => `Mettre en pause le suivi de ${animal}`,
    resume: (animal: string) => `Reprendre le suivi de ${animal}`,
    stop: (animal: string) => `Arrêter le suivi de ${animal}`,
  },
  dossierContext: {
    title: (animal: string) => `Dossier de ${animal}`,
    description:
      "Stive répond sur ce dossier tant que vous ne nommez pas un autre animal.",
    open: "Ouvrir le dossier",
  },
  capabilities: {
    title: "Ce que Stive sait faire",
    items: [
      "Votre point du jour : urgences, alertes, agenda et fiches à finir",
      "Le résumé d'un dossier, avec ses signaux et questions ouvertes",
      "Les créneaux libres d'un vétérinaire sur une période",
      "Les rendez-vous demandés par les propriétaires, à confirmer",
      "Un brouillon de message, que vous envoyez vous-même",
      "Mettre en pause, reprendre ou arrêter un suivi, après confirmation",
    ],
    conversation:
      "Discuter du métier comme avec un collègue : suivi post-opératoire, organisation, communication avec les propriétaires",
    conversationOff: "Discuter librement du métier : demande l'IA branchée",
    limits:
      "Il ne pose jamais de diagnostic sur un animal, ne donne ni dose ni prescription (voyez le RCP ou votre référentiel) et la décision vous revient toujours.",
  },
  privacy: {
    title: "Vos échanges",
    text: "Ils ne sont visibles que par vous, pas même par l'administrateur du cabinet. Ils sont effacés au bout de 30 jours.",
    usage: (used: number, limit: number) =>
      `Ce mois-ci : ${nombre(used, "demande", "demandes")} sur ${limit}.`,
    clear: "Effacer mes échanges",
    cleared: "Vos échanges avec Stive ont été effacés.",
  },
  hidden:
    "Cette réponse n'est plus disponible : vous n'avez plus accès à ce dossier.",
  openFile: "Ouvrir le dossier",
  briefing: {
    title: "Votre point du jour",
    calm: "Rien d'urgent pour l'instant : aucun suivi prioritaire ni alerte en attente.",
    active: (count: number) =>
      `${nombre(count, "suivi en cours", "suivis en cours")} dans votre périmètre.`,
    urgent: "Urgences",
    watch: "À surveiller",
    line: (procedure: string, day: number, vet: string) =>
      `${procedure} · J+${day} · ${vet}`,
    unacknowledged: (count: number) =>
      `${nombre(count, "alerte", "alertes")} sans accusé de réception`,
    agenda: "Aujourd'hui à l'agenda",
    agendaEmpty: "Aucun rendez-vous aujourd'hui.",
    pending: "à confirmer",
    pendingAppointments: (count: number) =>
      `${nombre(count, "rendez-vous demandé", "rendez-vous demandés")} à confirmer`,
    drafts: "Fiches de lancement à finir",
    draftLine: (vet: string) => `Responsable : ${vet}`,
    openAlerts: "Voir les alertes",
    openAgenda: "Voir l'agenda",
  },
  summary: {
    title: (animal: string) => `Résumé du dossier de ${animal}`,
    line: (procedure: string, day: number, status: string) =>
      `${procedure} · J+${day} · ${status}`,
    notLaunched:
      "Ce suivi n'est pas encore lancé : il n'y a pas encore d'échanges à résumer.",
    positives: "Signaux rassurants",
    negatives: "Signaux préoccupants",
    questions: "Questions ouvertes",
    exchanges: (messages: number, photos: number, voices: number) =>
      `${nombre(messages, "message", "messages")} du propriétaire, ${nombre(photos, "photo", "photos")}, ${nombre(voices, "vocal", "vocaux")}`,
    openAlerts: (count: number) =>
      `${nombre(count, "alerte en cours", "alertes en cours")}`,
    withheld: (count: number) =>
      `${nombre(count, "ligne écartée", "lignes écartées")} par les garde-fous : lisez la conversation dans le dossier.`,
  },
  slots: {
    title: "Créneaux libres",
    periods: {
      today: "aujourd'hui",
      tomorrow: "demain",
      day: "ce jour-là",
      this_week: "cette semaine",
      next_week: "la semaine prochaine",
      next_days: "les 7 prochains jours",
    },
    heading: (period: string, range: string) => `${period} (${range})`,
    ofVet: (vet: string) => `Agenda de ${vet}`,
    ofTeam: "Agenda de toute l'équipe",
    empty:
      "Aucun créneau libre sur cette période. Les créneaux viennent des captures d'agenda.",
    source:
      "Lus sur les captures d'agenda, en attendant la connexion à dr.veto.",
    openAgenda: "Ouvrir l'agenda",
  },
  appointments: {
    title: "Rendez-vous demandés",
    empty: "Aucun rendez-vous à confirmer.",
    callbacks: (count: number) =>
      `${nombre(count, "propriétaire attend", "propriétaires attendent")} un rappel, sans créneau choisi.`,
    readOnly:
      "Seule une personne autorisée à confirmer les rendez-vous peut décider.",
    line: (when: string, vet: string) => `${when} · ${vet}`,
    confirm: "Confirmer",
    decline: "Refuser",
    confirmLabel: (animal: string, when: string) =>
      `Confirmer le rendez-vous de ${animal}, ${when}`,
    declineLabel: (animal: string, when: string) =>
      `Refuser le rendez-vous de ${animal}, ${when}`,
    help: "Numa prévient le propriétaire dès votre décision.",
  },
  draft: {
    title: (recipients: string, animal: string) =>
      `Brouillon pour ${recipients} (${animal})`,
    use: "Ouvrir dans la conversation",
    help: "Le texte sera posé dans la zone de saisie du dossier. Rien ne part sans votre clic sur Envoyer.",
  },
  status: {
    question: {
      pause: (animal: string) => `Mettre en pause le suivi de ${animal} ?`,
      resume: (animal: string) => `Reprendre le suivi de ${animal} ?`,
      stop: (animal: string) => `Arrêter le suivi de ${animal} ?`,
    },
    effect: {
      pause:
        "Numa n'enverra plus de message ni de rappel tant que le suivi est en pause.",
      resume: "Numa reprendra les messages et les rappels prévus.",
      stop: "Plus aucun message ni rappel ne partira. Le dossier reste consultable.",
    },
    confirm: "Confirmer",
    confirmLabel: {
      pause: (animal: string) => `Confirmer la pause du suivi de ${animal}`,
      resume: (animal: string) => `Confirmer la reprise du suivi de ${animal}`,
      stop: (animal: string) => `Confirmer l'arrêt du suivi de ${animal}`,
    },
  },
  card: {
    toConfirm: "À confirmer",
    outcomes: {
      confirmed: "Rendez-vous confirmé",
      declined: "Rendez-vous refusé",
      paused: "Suivi mis en pause",
      resumed: "Suivi repris",
      stopped: "Suivi arrêté",
    },
    expired: "Plus possible : la situation a changé depuis.",
  },
  choose: {
    title: "De quel suivi parlez-vous ?",
    empty: "Aucun suivi en cours à vous proposer.",
    candidate: (animal: string, owner: string | null) =>
      owner ? `${animal} (${owner})` : animal,
  },
  unavailable: {
    not_clinical:
      "Je ne peux pas vous montrer ce dossier : votre accès ne comprend pas les données cliniques, ou ce suivi n'existe pas pour vous.",
    no_agenda: "Je ne peux pas lire l'agenda : votre accès ne le permet pas.",
    cannot_write: (animal: string) =>
      `Je ne peux pas préparer de message pour ${animal} : votre accès ne permet pas d'écrire aux propriétaires.`,
    cannot_steer: (animal: string) =>
      `Seul un vétérinaire qui suit ${animal} peut changer l'état de ce suivi.`,
    no_consent: (animal: string) =>
      `Le propriétaire de ${animal} n'a pas encore donné son accord : on ne peut pas encore lui écrire.`,
    test_followup: (animal: string) =>
      `${animal} est un suivi de test : aucun message ne part.`,
    same_status: {
      pause: (animal: string) =>
        `Le suivi de ${animal} ne peut pas être mis en pause dans son état actuel.`,
      resume: (animal: string) => `Le suivi de ${animal} n'est pas en pause.`,
      stop: (animal: string) => `Le suivi de ${animal} est déjà arrêté.`,
    },
    not_launched: (animal: string) =>
      `Le suivi de ${animal} n'est pas encore lancé : finissez d'abord sa fiche de lancement.`,
    thisFollowup: "ce suivi",
  },
  unknown: {
    title: "Je ne sais pas encore faire ça.",
    help: "Voici ce que je peux préparer pour vous :",
    simulated:
      "En mode simulé, je ne réponds qu'à mes six demandes : la conversation libre sur le métier demande l'IA branchée (variable AI_PROVIDER et clé dans le fichier .env du serveur).",
    aiUnavailableTitle: "L'IA ne répond pas pour l'instant.",
    aiUnavailable:
      "Réessayez dans un moment. En attendant, je peux toujours préparer ceci :",
  },
  /** Échanges simples en mode simulé : textes fixes, rien d'inventé. */
  smalltalk: {
    greeting:
      "Bonjour ! Je suis Stive, l'assistant IA de l'équipe. Je prépare, vous décidez.",
    thanks: "Avec plaisir. Je reste là si vous avez besoin d'autre chose.",
    identity:
      "Je suis Stive, une IA, l'assistant de l'équipe du cabinet. Je ne suis pas vétérinaire : je ne pose aucun diagnostic et je ne donne aucune dose ; la décision vous revient toujours.",
    help: "Voici ce que je peux préparer pour vous :",
  },
  /** Réponse libre de l'IA (ADR 0042). */
  reply: {
    withheldNote: "Réponse remplacée par les garde-fous de Stive.",
    withheld: {
      dosage:
        "Je ne donne ni dose, ni posologie, ni prescription : référez-vous au RCP du médicament et au référentiel thérapeutique du cabinet. La décision vous revient. Je peux en revanche vous aider à préparer l'explication au propriétaire ou les points de suivi.",
      prescription:
        "Je ne donne ni dose, ni posologie, ni prescription : référez-vous au RCP du médicament et au référentiel thérapeutique du cabinet. La décision vous revient. Je peux en revanche vous aider à préparer l'explication au propriétaire ou les points de suivi.",
      diagnosis:
        "Je ne pose pas de diagnostic sur un animal : seul l'examen par le vétérinaire le permet. Je peux vous aider à lister les points à vérifier ou à préparer l'échange avec le propriétaire.",
      identity:
        "Ma réponse ne respectait pas mes règles : je suis une IA, pas un vétérinaire. Pouvez-vous reformuler votre question ?",
      contact:
        "Ma réponse contenait un lien, une adresse ou un numéro, ce que je n'écris jamais. Pouvez-vous reformuler votre question ?",
      length:
        "Ma réponse était trop longue pour être affichée. Pouvez-vous poser une question plus précise ?",
    },
  },
  limit: {
    reached: (limit: number, date: string) =>
      `Vous avez utilisé vos ${limit} demandes de ce mois. Stive sera de nouveau disponible le ${date}.`,
    upgrade:
      "L'offre Premium comprend davantage de demandes : l'administrateur du cabinet peut changer de formule dans Facturation.",
    billing: "Voir les offres",
  },
  /** Starter : Stive présenté, sans aucune donnée. */
  upsell: {
    title: "Stive, l'assistant IA de votre équipe",
    description:
      "Point du jour, résumé d'un dossier, créneaux libres, rendez-vous à confirmer, brouillons de messages : Stive prépare, vous confirmez.",
    included: "Stive est compris dans les offres Pro et Premium.",
    action: "Voir les offres",
  },
  /** Carte du tableau de bord. */
  dashboard: {
    title: "Le point de Stive",
    promise: "Je prépare, vous décidez : je ne pose jamais de diagnostic.",
    askPlaceholder:
      "Demandez à Stive : un résumé de dossier, vos créneaux libres, un brouillon de message…",
    calm: "Rien à confirmer pour l'instant.",
    drafts: (count: number) =>
      `${nombre(count, "fiche de lancement", "fiches de lancement")} à finir`,
    nextAppointment: (time: string, title: string) =>
      `Prochain rendez-vous : ${time} · ${title}`,
    open: "Ouvrir Stive",
  },
  /** Bouton du dossier. */
  askAbout: "Demander à Stive",
  /** Brouillon posé dans la zone de saisie du dossier. */
  draftLoaded:
    "Brouillon préparé par Stive : relisez-le et complétez-le, puis cliquez sur Envoyer.",
};
