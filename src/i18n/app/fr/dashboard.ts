import { nombre } from "@/i18n/pluriel";

/** Textes de cette partie de l'espace cabinet (voir ADR 0022). */
export const dashboard = {
  title: "Aujourd'hui",
  greeting: (firstName: string) => `Bonjour ${firstName}`,
  /** Sous-titre avec accès clinique (la date est au-dessus du titre). */
  headlineShort: (urgent: number, watch: number) =>
    `${nombre(urgent, "urgence", "urgences")} et ${watch} cas à surveiller`,
  /**
   * Point du jour, en tête du tableau de bord (porté par Stive quand l'offre le comprend) :
   * des décomptes, jamais un avis médical.
   */
  briefing: {
    title: "Votre point du jour",
    clinical: (active: number, urgent: number, watch: number) => {
      const parts = [
        urgent
          ? `${nombre(urgent, "urgence attend", "urgences attendent")} un vétérinaire`
          : null,
        watch
          ? nombre(watch, "cas est à surveiller", "cas sont à surveiller")
          : null,
      ].filter((part): part is string => part !== null);
      const signals = parts.length
        ? `${parts.join(" et ")}.`
        : "Aucune alerte en attente.";
      const first = signals.charAt(0).toUpperCase() + signals.slice(1);
      return `${nombre(active, "animal suivi", "animaux suivis")} en ce moment. ${first}`;
    },
    summary: (active: number) =>
      `${nombre(active, "animal suivi", "animaux suivis")} en ce moment pour le cabinet.`,
    searchPlaceholder:
      "Rechercher un animal, un propriétaire, une intervention…",
    searchSubmit: "Rechercher dans les suivis",
  },
  /** Numa, en retrait : son rôle est auprès des propriétaires. */
  numa: {
    title: "Numa",
    text: (active: number) =>
      `échange avec les propriétaires de ${nombre(active, "animal suivi", "animaux suivis")} et vous transmet ce qui demande un vétérinaire.`,
  },
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
    newAnimal: "Enregistrer un animal",
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
  activity: {
    title: "Activité du cabinet",
    description: "30 derniers jours, suivis test exclus.",
    launched: "Suivis lancés",
    launchedHint: (ongoing: number) =>
      `${nombre(ongoing, "suivi", "suivis")} en cours`,
    ended: "Suivis terminés",
    messages: "Messages reçus",
    messagesHint: (outbound: number) =>
      `${nombre(outbound, "envoyé", "envoyés")} par Numa et l'équipe`,
    response: "Taux de réponse",
    responseHint: (answered: number, launched: number) =>
      `${answered} propriétaire${answered > 1 ? "s" : ""} sur ${launched} ont répondu`,
    responseNone: "Aucun suivi lancé sur la période",
    alerts: "Alertes",
    alertsHint: (open: number) =>
      `${nombre(open, "ouverte", "ouvertes")} en ce moment`,
    medianAck: (minutes: string) => `Prises en compte en ${minutes} (médiane)`,
    chartTitle: "Messages des 14 derniers jours",
    inbound: "Propriétaires",
    outbound: "Numa et équipe",
    chartRow: (day: string, inbound: number, outbound: number) =>
      `${day} : ${inbound} reçu${inbound > 1 ? "s" : ""}, ${outbound} envoyé${outbound > 1 ? "s" : ""}`,
  },
  next: {
    title: "Prochaines actions",
    drafts: (count: number) =>
      nombre(count, "fiche à lancer", "fiches à lancer"),
    unacknowledged: (count: number) =>
      nombre(
        count,
        "alerte sans accusé de réception",
        "alertes sans accusé de réception",
      ),
    controls: (count: number) =>
      nombre(count, "contrôle cette semaine", "contrôles cette semaine"),
    consent: (count: number) =>
      nombre(
        count,
        "accord WhatsApp en attente",
        "accords WhatsApp en attente",
      ),
    none: "Rien en attente.",
  },
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
    /** Rendez-vous Stivea : type et animal ; « autre » s'affiche simplement « Rendez-vous ». */
    appointment: (kind: string, animal: string) => `${kind} · ${animal}`,
    otherAppointment: "Rendez-vous",
  },
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
    annualChoice:
      "Engagement annuel ou mois : à vous de choisir. Sans réponse, rien ne bascule.",
  },
};
