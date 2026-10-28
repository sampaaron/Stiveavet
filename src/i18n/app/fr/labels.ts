/** Libellés des valeurs du métier (rôles, espèces, statuts), partagés par plusieurs écrans. */
export const labels = {
  roles: {
    admin_vet: "Vétérinaire administrateur",
    vet: "Vétérinaire",
    assistant: "Assistant vétérinaire",
  },
  permissions: {
    "organization.settings": "Modifier les réglages du cabinet",
    "team.manage": "Gérer l'équipe et les droits",
    "protocols.manage": "Créer et modifier les protocoles",
    "protocols.create_own": "Créer et modifier ses propres protocoles",
    "billing.manage": "Gérer l'abonnement et la facturation",
    "activity_log.read": "Consulter le journal d'activité",
    "followups.read_all":
      "Voir tous les suivis du cabinet (hors dossiers privés)",
    "followups.read_own": "Voir ses suivis et ceux partagés avec soi",
    "followups.read_summary":
      "Voir la liste organisationnelle des suivis, sans données cliniques",
    "followups.launch":
      "Préparer et lancer un suivi (lancement réservé aux vétérinaires)",
    "followups.share": "Partager ses suivis avec un confrère",
    "clinical.read":
      "Lire conversations, photos, vocaux et synthèses cliniques",
    "owner_messages.reply": "Répondre aux propriétaires",
    "appointments.confirm": "Confirmer manuellement un rendez-vous",
    "agenda.read": "Consulter l'agenda",
    "agenda.capture": "Envoyer une capture d'agenda (créneaux libres)",
    "stive.use": "Utiliser Stive, l'assistant IA interne",
    "alerts.watch": "Prendre en charge les alertes « à surveiller »",
  },
  followupStatus: {
    draft: "Brouillon",
    active: "En cours",
    paused: "En pause",
    human_takeover: "Repris par l'équipe",
    ended: "Terminé",
  },
  species: { dog: "Chien", cat: "Chat", both: "Chien et chat" },
  triage: {
    normal: "Rien à signaler",
    watch: "À surveiller",
    urgent: "Urgent",
  },
  protocolCategories: {
    surgery: "Chirurgie",
    dental: "Dentaire",
    treatment: "Suivi de traitement",
    other: "Autre",
  },
  stepKinds: {
    message: "Message",
    question: "Question",
    photo_request: "Demande de photo",
    reminder: "Rappel",
    control: "Rendez-vous de contrôle",
  },
  appointmentKinds: {
    post_op_control: "Contrôle post-opératoire",
    emergency: "Urgence",
    treatment_followup: "Suivi de traitement",
    other: "Autre rendez-vous",
  },
  weekdays: {
    1: "Lundi",
    2: "Mardi",
    3: "Mercredi",
    4: "Jeudi",
    5: "Vendredi",
    6: "Samedi",
    7: "Dimanche",
  },
  emergencyPeriods: {
    day: "Pendant les horaires du cabinet",
    night: "La nuit",
    weekend: "Le week-end",
    holiday: "Les jours fériés",
  },
  /** Offres (noms, accroche, Stive), mêmes mots que le site public. */
  plans: {
    starter: {
      name: "Starter",
      pitch: "Pour un vétérinaire qui démarre ses suivis",
      stive: "Sans Stive",
    },
    pro: {
      name: "Pro",
      pitch: "L'offre la plus choisie par les cabinets",
      stive: "Stive inclus",
    },
    premium: {
      name: "Premium",
      pitch: "Toute l'équipe, et le logiciel du cabinet connecté",
      stive: "Stive pour chaque vétérinaire",
    },
  },
  planFeatured: "Offre phare",
  /** Quotas d'une offre, tels que le catalogue les fixe. */
  planQuota: {
    vets: (count: number) =>
      count === 1 ? "1 vétérinaire" : `Jusqu'à ${count} vétérinaires`,
    assistants: (count: number | null) =>
      count === null
        ? "Assistants sans limite"
        : count === 1
          ? "1 assistant"
          : `Jusqu'à ${count} assistants`,
    followups: (included: number, max: number) =>
      `${included} suivis actifs inclus, jusqu'à ${max}`,
    integrations: "Connexion au logiciel du cabinet (dr.veto)",
  },
  /** Motif d'un triage automatique ; un motif écrit par un vétérinaire s'affiche tel quel. */
  triageReasons: {
    red_flag: "Signal d'urgence reconnu dans le message du propriétaire.",
    rule: (sign: string) => `Signe d'alerte du suivi : ${sign}`,
    concern:
      "Inquiétude ou signe à vérifier, sans signe d'alerte reconnu : escaladé par prudence.",
    none: "Aucun signe d'alerte.",
    after_end: "Le propriétaire a réécrit après la fin du suivi automatisé.",
  },
  /** Langue d'un propriétaire ou de l'interface. */
  languages: { fr: "Français", en: "Anglais" },
  languageSources: {
    import: "d'après le dossier",
    detected: "reconnue dans ses messages",
    vet: "choisie par le cabinet",
  },
};
