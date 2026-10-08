/** Textes de cette partie de l'espace cabinet (voir ADR 0022). */
export const dossier = {
  title: "Dossier de suivi",
  back: "Suivis",
  /** Confirmation après une action, d'après `?fait=` dans l'adresse. */
  done: {
    lance:
      "Suivi lancé : Numa enverra son premier message à l'heure prévue, au nom du cabinet.",
    pause:
      "Suivi mis en pause : aucune relance ne part tant qu'il n'est pas repris.",
    reprise: "Suivi repris.",
    arret: "Suivi arrêté : les envois et rappels prévus sont annulés.",
    reactivation: "Suivi réactivé.",
    "reprise-en-main":
      "Message envoyé : vous avez repris la main, Numa est en pause jusqu'à « Reprendre Numa ».",
    message: "Message envoyé depuis le WhatsApp du cabinet.",
    numa: "Numa reprend la conversation.",
    "alerte-recue": "Réception confirmée : l'escalade est annulée.",
    "alerte-close": "Alerte close.",
  },
  header: {
    responsible: "Responsable :",
    protocol: "Protocole :",
    /** Jours depuis l'intervention. */
    day: (days: number) => `J+${days}`,
    private: "Dossier privé",
    protocolVersion: (name: string, version: number) =>
      `${name}, version ${version}`,
    months: (count: number) => `${count} mois`,
    years: (count: number) => `${count} an${count > 1 ? "s" : ""}`,
  },
  alertsSection: "Alertes du triage",
  steering: {
    draftTitle: "Suivi en préparation",
    draftDescription:
      "Rien n'est envoyé au propriétaire avant le lancement par le vétérinaire responsable.",
    openLaunchSheet: "Ouvrir la fiche de lancement",
    title: "Pilotage du suivi",
    description:
      "Vous pouvez modifier, mettre en pause, arrêter ou reprendre ce suivi à tout moment.",
    edit: "Modifier le suivi",
    pause: "Mettre en pause",
    resume: "Reprendre le suivi",
    reactivate: "Réactiver le suivi",
    stop: "Arrêter le suivi",
    stopWarning:
      "Numa n'enverra plus rien pour ce suivi : messages et rappels prévus sont annulés. La discussion reste consultable.",
    confirmStop: "Confirmer l'arrêt",
  },
  basic: {
    organization: "Organisation",
    owner: "Propriétaire",
    status: "État du suivi",
    start: "Début du suivi",
    control: "Contrôle",
    notScheduled: "Non programmé",
    intervention: "Intervention",
    procedure: "Acte",
    date: "Date",
    protocol: "Protocole",
    restrictedTitle: "Données cliniques réservées",
    restricted:
      "Conversation, photos, vocaux et synthèses ne sont visibles que par les personnes autorisées à lire les données cliniques.",
  },
  synthesis: {
    title: "Synthèse pré-consultation",
    description:
      "Préparée par l'IA à partir des échanges (simulation). Elle ne remplace pas votre examen.",
    exchanges: (ownerMessages: number, photos: number, voiceNotes: number) =>
      `Échanges : ${ownerMessages} ${ownerMessages > 1 ? "messages du propriétaire" : "message du propriétaire"}, ${photos} ${photos > 1 ? "photos" : "photo"}, ${voiceNotes} ${voiceNotes > 1 ? "messages vocaux" : "message vocal"}.`,
    positives: "Signaux rassurants",
    negatives: "Signaux préoccupants",
    alerts: "Alertes",
    openQuestions: "Questions ouvertes",
    withheld: (count: number) =>
      `${count > 1 ? `${count} éléments ont été écartés par les garde-fous` : "Un élément a été écarté par les garde-fous"} : lisez la conversation pour le détail.`,
    generated: (date: string) =>
      `Préparée le ${date}, sans diagnostic ni conduite à tenir.`,
    empty: "Pas encore assez d'échanges pour une synthèse.",
    alertState: {
      open: "sans accusé de réception",
      escalated: "équipe prévenue, sans accusé de réception",
      acknowledged: (name: string) => `reçue par ${name}`,
      aVet: "un vétérinaire",
      resolved: "close",
    },
  },
  contacts: {
    title: "Propriétaires et accord",
    groupOpen:
      "Groupe WhatsApp ouvert avec les deux propriétaires et Numa. Chacun peut le quitter par STOP.",
    groupLater:
      "Un groupe WhatsApp sera créé quand les deux contacts auront accepté.",
    primary: "contact principal",
    secondary: "second contact",
    phoneEnding: (ending: string) => `WhatsApp se terminant par ${ending}`,
    whatsapp: "WhatsApp",
    /** Langue dans une phrase (« français, d'après le dossier »). */
    languageNames: { fr: "français", en: "anglais" },
    language: (language: string, source: string) => `${language}, ${source}`,
    languageForm: {
      label: (name: string) => `Langue de Numa avec ${name}`,
      help: "Votre choix prime sur la langue reconnue dans ses messages.",
      submit: "Corriger la langue",
      saved: (language: string) =>
        `Langue corrigée : Numa écrira désormais en ${language}.`,
    },
  },
  appointments: {
    title: "Rendez-vous",
    description:
      "Numa ne propose que des créneaux libres du vétérinaire responsable ; le cabinet confirme.",
    chosenWithNuma: "choisi avec Numa",
    toConfirm: "À confirmer",
    confirmed: "Confirmé",
  },
  treatments: {
    title: "Traitements validés",
    importedFromDrveto: "(importé de dr.veto)",
    validatedBy: (name: string) => `validé par ${name}`,
    none: "Aucun traitement à rappeler.",
    pending: (count: number) =>
      `${count > 1 ? `${count} traitements importés attendent votre validation` : "Un traitement importé attend votre validation"} : aucun rappel n'en parle avant.`,
    noDosage: "Numa ne crée ni ne modifie jamais une posologie.",
  },
  imported: {
    title: "Allergies et antécédents",
    description: "Résumé importé de dr.veto (simulé).",
    none: "Aucun résumé importé pour ce suivi.",
    noAllergy: "Aucune allergie connue",
    antecedents: "Antécédents",
  },
  programme: {
    title: "Prochaines étapes",
    control: (when: string) => `Contrôle : ${when}`,
    notScheduled: "non programmé",
    stepsLabel: "Étapes du suivi",
    noSteps: "Aucune étape programmée.",
    full: (count: number) =>
      `Programme complet (${count} ${count > 1 ? "étapes" : "étape"})`,
    states: {
      sentAt: (at: string) => `Envoyé le ${at}`,
      sent: "Envoyé",
      sending: "Envoi en cours",
      failed: "Envoi en échec (voir les tâches en échec)",
      scheduledAt: (at: string) => `Prévu le ${at}`,
      scheduled: "Prévu",
      waitingConsent: "Après l'accord du propriétaire",
      onHold: "En attente : Numa n'a pas la main",
      notSent: "Non envoyé",
      afterEnd: "Après la fin du suivi : ne partira pas",
    },
    upcomingNotes: {
      waitingConsent: "après l'accord du propriétaire",
      onHold: "en attente : Numa n'a pas la main",
    },
    endedAutomatically: (at: string | null) =>
      `Suivi automatisé terminé${at ? ` le ${at}` : ""}, à la date de contrôle. La conversation reste ouverte : Numa répond si le propriétaire écrit, et vous êtes prévenu.`,
    stopped: (at: string | null) =>
      `Suivi arrêté${at ? ` le ${at}` : ""} : plus aucun rappel ne part.`,
    plannedEndAtControl: (at: string) =>
      `Fin du suivi automatisé le ${at}, date du contrôle. La conversation restera ouverte.`,
    plannedEndAfterLastStep: (at: string) =>
      `Fin du suivi automatisé le ${at}, un jour après la dernière étape. La conversation restera ouverte.`,
    noEnd:
      "Aucune fin automatique prévue : arrêtez le suivi vous-même, ou fixez un rendez-vous de contrôle.",
  },
  access: {
    title: "Accès au dossier",
    privateDescription:
      "Dossier privé : visible seulement par vous et les confrères avec qui vous le partagez.",
    publicDescription:
      "Visible par les personnes du cabinet autorisées à voir tous les suivis.",
    sharedWith: "Partagé avec",
    until: (date: string) => `Jusqu'au ${date}`,
    untilRevoked: "Jusqu'à retrait",
    noShares: "Aucun partage.",
    noCandidates: "Aucun autre vétérinaire actif à qui partager ce dossier.",
    vet: "Vétérinaire",
    choose: "Choisir…",
    duration: "Durée",
    days: (count: number) => `${count} jours`,
    share: "Partager le dossier",
    revokeLabel: (name: string) => `Retirer le partage avec ${name}`,
    makePublic: "Rendre visible au cabinet",
    makePrivate: "Rendre le dossier privé",
    chooseVet: "Choisissez un vétérinaire.",
    shared: "Dossier partagé.",
    revoked: "Partage retiré.",
    madePrivate: "Dossier rendu privé.",
    madePublic: "Dossier visible par le cabinet.",
  },
  conversation: {
    title: "Conversation WhatsApp",
    aiNotice:
      "Numa est une IA : elle ne pose pas de diagnostic, ne modifie aucun traitement et renvoie toute question médicale au vétérinaire.",
    delivery: {
      queued: "envoi en cours",
      awaiting_reply: "partira à la réponse du propriétaire",
      failed: "non envoyé",
    },
    deletedPhoto: "Photo supprimée (durée de conservation atteinte)",
    deletedVoice: "Message vocal supprimé (durée de conservation atteinte)",
    photo: "Photo",
    durationUnknown: "durée inconnue",
    inGroup: "groupe",
    to: (name: string) => `à ${name}`,
    consent: {
      requested: "accord demandé",
      given: "accord donné",
      withdrawn: "STOP",
    },
    stopRequested: "STOP dans le groupe, réponse attendue",
    leftGroup: "a quitté le groupe",
    notContacted: "pas encore contacté",
    contactState: (name: string, state: string) => `${name} : ${state}`,
    groupOpen: "Groupe WhatsApp ouvert",
    groupLater: "Groupe créé quand les deux auront accepté",
    /** Message du propriétaire fait d'un fichier seul, avant sa réception ou après un refus. */
    fileSent: "Fichier envoyé par WhatsApp",
    /** Traces du groupe (messages « système »), selon leur code. */
    notes: {
      group_created: (names: string) =>
        `Groupe WhatsApp du suivi créé avec ${names} (simulé).`,
      left_group: (name: string) => `${name} a quitté le groupe.`,
      group_emptied: (name: string) =>
        `${name} a quitté le groupe ; plus personne n'y reste, il est fermé.`,
      group_stopped: (name: string) =>
        `Groupe fermé : ${name} a demandé l'arrêt du suivi.`,
      file_refused: (name: string) =>
        `Fichier de ${name} non reçu : trop lourd ou format non pris en charge. Numa lui a demandé de le renvoyer ou de décrire la situation.`,
    },
    states: {
      stoppedByOwner:
        "Un propriétaire a demandé l'arrêt du suivi : plus aucun message automatique n'est envoyé.",
      notStarted:
        "Numa n'a pas encore écrit : son premier message part à l'heure prévue.",
      consentRequested:
        "En attente de l'accord du propriétaire : aucun contenu de suivi avant son OUI.",
      consentWithdrawn:
        "Le propriétaire a écrit STOP : plus aucun message ne lui est envoyé.",
      takeover: "Vous avez repris la main : Numa est en pause.",
      paused: "Suivi en pause : Numa n'envoie rien.",
      endedAutomatically:
        "Suivi automatisé terminé à la date de contrôle : Numa répond encore si le propriétaire écrit, et vous êtes prévenu.",
      ended: "Suivi arrêté : la conversation reste consultable.",
      active: "Numa suit la conversation.",
    },
    emptyTitle: "Aucun message pour l'instant",
    emptyTest: "Suivi test : rien n'est envoyé au propriétaire.",
    emptyScheduled: (name: string) =>
      `Numa écrira à ${name} à l'heure choisie, dans la plage d'envoi du cabinet.`,
    readOnly:
      "Lecture seule : répondre au propriétaire demande un droit que l'administrateur peut vous ouvrir.",
    afterConsent:
      "Vous pourrez écrire au propriétaire une fois son accord donné.",
    localEnvironment: "Environnement local :",
    openSimulator: "ouvrir le simulateur du propriétaire",
    composer: {
      label: (names: string) => `Écrire à ${names}`,
      help: "Le message part du WhatsApp professionnel du cabinet.",
      pausesNuma:
        "Numa se met en pause dès que vous écrivez, jusqu'à « Reprendre Numa ».",
      staysPaused: "Numa reste en pause.",
      placeholder: (animal: string) => `Votre message au sujet de ${animal}`,
      send: "Envoyer",
    },
    resumeNuma: "Reprendre Numa",
  },
  /** Messages d'erreur des formulaires de la conversation et du simulateur. */
  validation: {
    emptyMessage: "Écrivez un message.",
    messageTooLong: "Message trop long.",
    choosePhoto: "Choisissez une photo.",
    photoTooLarge: "Photo trop lourde : 5 Mo au plus.",
    captionTooLong: "Légende trop longue.",
    spokenEmpty: "Écrivez ce que dit le message vocal.",
    spokenTooLong: "Message vocal trop long (1 000 caractères au plus).",
  },
  simulator: {
    title: "Simulateur du propriétaire",
    done: {
      envoye: "Message du propriétaire reçu par Stivea Vet.",
      avance: "Prochain envoi prévu exécuté.",
      photo: "Photo du propriétaire reçue par Stivea Vet.",
      vocal: "Message vocal du propriétaire reçu et transcrit (simulation).",
    },
    back: (animal: string) => `Dossier de ${animal}`,
    intro: (name: string) =>
      `Environnement local uniquement. Vous jouez ${name} : vos messages arrivent dans Stivea Vet comme s'ils venaient de WhatsApp. Rien n'est envoyé à un vrai numéro.`,
    personaNav: "Propriétaire joué",
    playing: "Vous jouez :",
    play: (name: string) => `Jouer ${name}`,
    phoneLabel: (name: string) => `WhatsApp de ${name} (simulé)`,
    practice: "Cabinet vétérinaire",
    business: "WhatsApp Business (simulé)",
    messagesLabel: "Messages reçus et envoyés",
    noMessages: "Aucun message reçu pour l'instant.",
    howTitle: "Comment l'utiliser",
    how: "Le premier message de Numa part à l'heure choisie sur la fiche de lancement. Pour ne pas attendre, avancez jusqu'au prochain envoi prévu : premier message, rappel du programme, puis fin du suivi à la date de contrôle. Répondez OUI pour donner l'accord, STOP pour le retirer, REPRENDRE pour le redonner.",
    mediaSection: "Photo ou message vocal",
    group: "Groupe",
    practiceFallback: "Cabinet",
    photoAlt: "Photo envoyée",
    quickReplies: "Réponses rapides",
    messageOf: (name: string) => `Message de ${name}`,
    placeholder: "Écrire comme le propriétaire",
    sendAsOwner: "Envoyer en tant que propriétaire",
    runDue: "Avancer jusqu'au prochain envoi prévu",
    photoOf: (name: string) => `Photo envoyée par ${name}`,
    caption: "Légende (facultative)",
    photoHelp:
      "JPEG, PNG ou WebP, 5 Mo au plus. Utilisez une image sans donnée réelle.",
    sendPhoto: "Envoyer la photo",
    voiceOf: (name: string) => `Ce que dit le message vocal de ${name}`,
    voicePlaceholder: "Par exemple : elle mange bien depuis ce matin",
    voiceHelp:
      "Un vrai fichier son est créé ; la transcription simulée relit ce texte.",
    sendVoice: "Envoyer le vocal",
  },
};
