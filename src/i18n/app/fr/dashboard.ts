/** Textes de cette partie de l'espace cabinet (voir ADR 0022). */
export const dashboard = {
  title: "Aujourd'hui",
  greeting: (firstName: string) => `Bonjour ${firstName}`,
  /** Sous-titre avec accès clinique : la date, puis les urgences et les cas à surveiller. */
  headline: (day: string, urgent: number, watch: number) =>
    `${day} · ${urgent} urgence${urgent > 1 ? "s" : ""} et ${watch} cas à surveiller`,
  empty: {
    title: "Aucun suivi pour l'instant",
    admin:
      "Votre cabinet est créé. Le démarrage guidé vous accompagne : WhatsApp, dr.veto, urgences, équipe, protocoles et suivi test. Vos suivis apparaîtront ici.",
    member: "Vos suivis apparaîtront ici.",
    guidedSetup: "Ouvrir le démarrage guidé",
  },
  actions: {
    openAFile: "Ouvrir un dossier",
    launch: "Lancer un suivi",
    openFile: "Ouvrir le dossier",
    writeToOwner: "Écrire au propriétaire",
    allFollowups: "Tous les suivis",
    agenda: "Agenda",
  },
  /** Ligne d'un suivi : ce qui a changé en dernier, en une phrase. */
  summary: {
    paused: "Suivi en pause : aucune relance n'est envoyée",
    humanTakeover: "L'équipe a repris la conversation : Numa est en pause",
    consentWithdrawn:
      "Le propriétaire a écrit STOP : plus aucun message ne part",
    consentRequested: "Premier message envoyé, accord en attente",
    notStarted: "Premier message de Numa à venir",
    quiet: "Aucune nouvelle du propriétaire pour l'instant",
  },
  /** Propos du propriétaire, cités, avec la pièce jointe éventuelle. */
  owner: {
    photo: "photo reçue",
    voice: "message vocal reçu",
    photoOnly: "Photo reçue",
    voiceOnly: "Message vocal reçu",
    messageOnly: "Message reçu",
    quote: (text: string) => `« ${text} »`,
    quoteWith: (text: string, media: string) => `« ${text} », ${media}`,
  },
  dayLabel: (days: number) => `J+${days}`,
  urgentReportedAt: (animalName: string, time: string) =>
    `${animalName} : urgence signalée à ${time}`,
  urgentOngoing: (animalName: string) => `${animalName} : urgence en cours`,
  stats: {
    urgent: "Urgences",
    urgentHint: "À traiter maintenant",
    watch: "À surveiller",
    watchHint: "Signalés par Numa",
    active: "Suivis actifs",
    appointments: "Rendez-vous Stivea",
    appointmentsHint: "Aujourd'hui, confirmés par le cabinet",
  },
  priorities: {
    title: "Priorités",
    description: "Urgences et cas à surveiller, du plus grave au plus récent.",
    emptyTitle: "Aucune priorité",
    emptyDescription: "Tous les suivis évoluent normalement.",
  },
  others: {
    title: "Autres suivis actifs",
    empty: "Aucun autre suivi actif",
  },
  organization: {
    title: "Suivis du cabinet",
    description:
      "Vue d'organisation. Les données cliniques sont réservées aux personnes autorisées.",
    empty: "Aucun suivi à afficher",
  },
  agenda: {
    title: "Agenda du jour",
    description:
      "Agenda dr.veto complet (simulé) ; rendez-vous Stivea identifiés.",
    emptyTitle: "Aucun rendez-vous aujourd'hui",
    emptyDescription:
      "Connectez dr.veto dans les réglages pour voir l'agenda complet.",
  },
  quickActions: "Actions rapides",
  numa: (animals: number) =>
    `Suit ${animals} ${animals > 1 ? "animaux" : "animal"} pour la clinique. Elle ne pose jamais de diagnostic et escalade en cas de doute.`,
  stive:
    "Votre point du jour sera prêt ici. Toute action réelle attendra votre confirmation.",
  notFound: {
    title: "Cet écran n'est pas encore disponible",
    description:
      "Il arrive dans un prochain lot de la phase 1. Les données affichées dans Stivea restent fictives.",
    back: "Revenir à Aujourd'hui",
  },
  /** Rappel de l'état de facturation, sur tout l'espace cabinet. */
  billing: {
    open: "Ouvrir la facturation",
    grace: (date: string) =>
      `Prélèvement refusé : à régulariser avant le ${date}.`,
    blocked:
      "Nouveaux suivis suspendus. Les suivis en cours continuent jusqu'à leur fin.",
    readOnly: (date: string) => `Cabinet en lecture seule jusqu'au ${date}.`,
    closed: "L'accès au cabinet est terminé.",
  },
};
