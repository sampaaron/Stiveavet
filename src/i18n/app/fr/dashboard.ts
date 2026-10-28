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
  /** Opérés du jour (ADR 0047), lus dans dr.veto : une fiche par animal, en un clic. */
  operated: {
    title: "Opérés du jour",
    description:
      "Lus dans dr.veto. Préparer la fiche reprend l'intervention, le protocole proposé, l'heure du premier message et le contrôle.",
    at: (time: string) => `Opéré à ${time}`,
    by: (vet: string) => `par ${vet}`,
    prepare: "Préparer la fiche",
    prepareAll: (count: number) => `Tout préparer (${count})`,
    draft: "Fiche prête à lancer",
    open: "Suivi en cours",
    done: (count: number) =>
      count
        ? `${nombre(count, "fiche préparée", "fiches préparées")} : relisez-les dans « Prêts à lancer ».`
        : "Aucune fiche préparée : ces animaux sont déjà suivis.",
  },
  /**
   * File « Prêts à lancer » (ADR 0046) : fiches préparées par l'équipe, que seul le vétérinaire
   * responsable lance, en un clic, après les avoir relues.
   */
  ready: {
    title: "Prêts à lancer",
    description:
      "Fiches préparées par l'équipe. Relisez chaque carte : seul le vétérinaire responsable lance le suivi.",
    protocol: (name: string) => `Protocole « ${name} »`,
    noProtocol: "Aucun protocole choisi",
    firstMessage: (at: string) => `Premier message : ${at}`,
    firstMessageNow: "Premier message dès le lancement",
    control: (at: string) => `Contrôle : ${at}`,
    treatments: (count: number) =>
      count > 1
        ? `${count} traitements importés de dr.veto, validés en lançant :`
        : "1 traitement importé de dr.veto, validé en lançant :",
    blockers: {
      launch_incomplete: "Fiche à compléter",
      integration_missing: "WhatsApp à relier au cabinet",
      optin_missing: "Accord WhatsApp du propriétaire à noter",
    },
    waiting: (vet: string) => `Prête, attend ${vet}`,
    launch: "Lancer",
    launchWithTreatments: (count: number) =>
      count > 1
        ? `Valider les ${count} traitements et lancer`
        : "Valider le traitement et lancer",
    review: "Relire la fiche",
    complete: "Compléter la fiche",
    forAnimal: (animal: string) => ` : ${animal}`,
    recordOptIn: "Noter l'accord du propriétaire",
    recordOptInHint:
      "Recueilli à l'accueil : le propriétaire accepte d'être contacté sur WhatsApp.",
    optInRecorded: "Accord WhatsApp noté.",
    launchAll: (count: number) => `Tout lancer (${count})`,
    launchAllTitle: (count: number) =>
      `Lancer ${nombre(count, "suivi", "suivis")} ?`,
    launchAllDescription:
      "Les traitements importés affichés sur chaque carte seront validés en votre nom. Numa enverra ensuite chaque premier message à l'heure prévue.",
    launchAllConfirm: "Tout lancer",
    done: (launched: number, failed: number) =>
      [
        launched
          ? `${nombre(launched, "suivi lancé", "suivis lancés")} : Numa enverra chaque premier message à l'heure prévue.`
          : null,
        failed
          ? failed > 1
            ? `${failed} fiches ont changé ou ne sont plus prêtes : ouvrez-les pour les relire.`
            : "1 fiche a changé ou n'est plus prête : ouvrez-la pour la relire."
          : null,
      ]
        .filter((part) => part !== null)
        .join(" "),
  },
  /** Temps gagné (ADR 0046) : une estimation, dont le calcul est affiché. */
  timeSaved: {
    line: (duration: string, checkIns: number) =>
      `Environ ${duration} gagnées sur 30 jours : ${nombre(checkIns, "prise de nouvelles faite", "prises de nouvelles faites")} par Numa à la place d'un appel.`,
    how: (callMinutes: number, launchMinutes: number) =>
      `Estimation : ${callMinutes} min par appel évité, moins ${launchMinutes} min par suivi lancé.`,
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
  controlsChip: (count: number) =>
    `${nombre(count, "contrôle", "contrôles")} aujourd'hui : synthèses prêtes`,
  /** Boîte « À traiter » (ADR 0048) : alertes, réponses attendues, tâches en échec. */
  inbox: {
    title: (count: number) => (count ? `À traiter (${count})` : "À traiter"),
    label: "À traiter",
    description:
      "Alertes, propriétaires qui attendent l'équipe et tâches en échec, du plus urgent au moins urgent. Chaque ligne propose l'action à faire.",
    emptyTitle: "Rien à traiter",
    emptyDescription:
      "Aucune alerte, aucune réponse attendue, aucune tâche en échec.",
    reply: "Répondre",
    appointment: "Voir l'agenda",
    awaiting: (animal: string) => `${animal} · le propriétaire attend l'équipe`,
    awaitingSince: (when: string, paused: boolean) =>
      `Dernier message du propriétaire ${when}. ${paused ? "Numa est en pause" : "L'équipe a repris la main"} : la réponse vient de vous.`,
    task: (label: string) => `Tâche en échec · ${label}`,
    more: (count: number) =>
      `${nombre(count, "autre élément", "autres éléments")} : voir toutes les alertes`,
    done: {
      "alerte-recue": "Réception confirmée : l'escalade est annulée.",
      "alerte-close": "Alerte close.",
      "alerte-confiee": "Alerte confiée : le vétérinaire choisi est prévenu.",
      "tache-relance": "Tâche relancée.",
      "tache-abandon": "Tâche abandonnée.",
    },
  },
  /** « Contrôles du jour » (ADR 0048) : synthèse prête avant la consultation. */
  controls: {
    title: "Contrôles du jour",
    description:
      "La synthèse de chaque animal est prête avant la consultation. « Copier pour dr.veto » la met dans votre presse-papiers : rien n'est écrit seul dans dr.veto.",
    at: (time: string, day: number) => `Contrôle à ${time} · J${day}`,
    read: "Lire la synthèse",
  },
  others: {
    quiet: (count: number) =>
      `${nombre(count, "suivi", "suivis")} : rien à signaler`,
    quietHint:
      "Aucun signe d'alerte du protocole. Ouvrez la liste seulement si besoin.",
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
