/** Textes de cette partie de l'espace cabinet (voir ADR 0022). */
export const settings = {
  title: "Numa, urgences et garde",
  description:
    "Ce que Numa, assistante IA, applique à tous les suivis du cabinet. Numa ne prend jamais de décision médicale : elle transmet vos consignes et vous alerte.",
  applyDefaults: "Appliquer les réglages de départ",
  unconfigured: {
    title: "Ces réglages ne sont pas encore définis.",
    body: "Les réglages de départ (envois du lundi au samedi de 8 h à 20 h, rendez-vous en semaine de 9 h à 18 h, consignes d'urgence génériques) se modifient ensuite ici.",
  },
  windows: {
    from: "de",
    to: "à",
    start: (day: string) => `${day} : début`,
    end: (day: string) => `${day} : fin`,
  },
  messageWindows: {
    title: "Horaires d'envoi des messages",
    description:
      "Numa n'envoie ses messages programmés aux propriétaires que pendant ces plages (heure de Paris). Une réponse du propriétaire est toujours reçue.",
    legend: "Jours et heures d'envoi",
    submit: "Enregistrer les horaires",
  },
  appointments: {
    title: "Rendez-vous proposés par Numa",
    description:
      "Quand un propriétaire demande un rendez-vous, Numa propose jusqu'à trois créneaux libres de l'agenda du vétérinaire responsable, dans ces plages seulement (heure de Paris). Sans créneau adapté, elle annonce que le cabinet rappellera. Chaque rendez-vous attend la confirmation de l'équipe.",
    legend: "Jours et heures des rendez-vous proposés",
    submit: "Enregistrer les plages",
    duration: (kind: string) => `${kind} (minutes)`,
    submitDurations: "Enregistrer les durées",
  },
  instructions: {
    title: "Consignes d'urgence",
    description:
      "Transmises telles quelles au propriétaire quand Numa détecte un signe d'urgence, selon le moment. Rédigez-les vous-même : Numa n'y ajoute aucun conseil médical.",
    saveLabel: (period: string) => `Enregistrer : ${period}`,
  },
  contacts: {
    title: "Contacts d'urgence",
    description:
      "Numéros communiqués au propriétaire avec les consignes (6 au plus).",
    empty: "Aucun contact d'urgence pour l'instant.",
    label: "Libellé du contact",
    labelHint:
      "Par exemple : accueil du cabinet, clinique de garde partenaire.",
    phone: "Numéro",
    add: "Ajouter le contact",
    removeLabel: (label: string) => `Retirer le contact ${label}`,
  },
  alerts: {
    title: "Règles d'alerte",
    description: "Le délai d'escalade se règle entre 3 et 5 heures.",
    delay: "Délai avant d'alerter les autres vétérinaires",
    delayHint:
      "Sans accusé de réception d'une alerte urgente dans ce délai, les autres vétérinaires du cabinet sont prévenus. Les consignes d'urgence partent au propriétaire immédiatement, sans attendre.",
    photoAnalysis: "Analyse assistée des photos",
    photoAnalysisHint:
      "Désactivée par défaut. Numa ne fournit que des observations et des signaux de risque ; elle ne pose jamais de diagnostic.",
    submit: "Enregistrer les règles d'alerte",
  },
  onCall: {
    title: "Planning de garde",
    description:
      "Une alerte urgente va d'abord au vétérinaire responsable du suivi ou au vétérinaire de garde. Une garde dure au plus 14 jours et ne chevauche pas une autre.",
    empty:
      "Aucune garde prévue : les alertes urgentes vont au vétérinaire responsable du suivi.",
    period: (start: string, end: string) => `Du ${start} au ${end}`,
    removeLabel: (name: string, start: string, end: string) =>
      `Retirer la garde de ${name}, du ${start} au ${end}`,
    vet: "Vétérinaire de garde",
    choose: "Choisir…",
    start: "Début",
    end: "Fin",
    add: "Ajouter la garde",
  },
  integrations: {
    title: "Connexions",
    description:
      "Simulées pendant cette phase : aucun numéro WhatsApp, cabinet dr.veto ou compte bancaire réel n'est contacté.",
    simulated: "Simulé",
    connected: "Connecté",
    /** Suite de « Connecté », après le mot en gras. */
    connectedDetail: (label: string, date: string) =>
      ` : ${label}, depuis le ${date}.`,
    removeLabel: (title: string) => `Retirer la connexion ${title}`,
    whatsapp: {
      title: "WhatsApp Business",
      description:
        "Le numéro professionnel du cabinet, d'où Numa écrit aux propriétaires et où arrivent les alertes urgentes.",
      submit: "Connecter le numéro (simulé)",
      field: "Numéro WhatsApp Business",
      hint: "Seuls les deux derniers chiffres sont conservés.",
      live: {
        description:
          "Connectez le numéro WhatsApp Business du cabinet avec votre compte Meta. Numa écrira depuis ce numéro ; Stivea Vet ne voit jamais votre mot de passe.",
        pin: "Code PIN de vérification en deux étapes",
        pinHint:
          "6 chiffres. Si le numéro en a déjà un, saisissez-le ; sinon, choisissez-le et gardez-le précieusement. Il n'est pas conservé par Stivea Vet.",
        submit: "Connecter avec Meta",
        waiting:
          "Fenêtre de Meta ouverte : suivez les étapes, puis revenez ici.",
        finishing: "Connexion du numéro en cours…",
        cancelled:
          "Connexion interrompue dans la fenêtre de Meta. Vous pouvez recommencer.",
        unavailable:
          "La fenêtre de Meta n'a pas pu s'ouvrir. Autorisez les fenêtres de ce site, puis réessayez.",
      },
    },
    drveto: {
      title: "dr.veto",
      description:
        "Le logiciel du cabinet, pour retrouver l'animal, le propriétaire et l'agenda.",
      submit: "Connecter dr.veto (simulé)",
      field: "Code du cabinet dr.veto",
      hint: "Code fictif, par exemple CAB-1234.",
    },
    payment_mandate: {
      title: "Mandat de prélèvement",
      description:
        "Pour l'essai pilote à 86 € HT par mois. Aucune donnée bancaire n'est demandée pendant cette phase.",
      submit: "Signer le mandat (simulé)",
      submitLive: "Signer le mandat SEPA",
      descriptionLive:
        "Prélèvement SEPA des factures. Vous saisissez votre IBAN sur la page sécurisée de Stripe : Stivea Vet ne le voit jamais.",
    },
  },
  notices: {
    defaultsApplied:
      "Réglages de départ appliqués. Vous pouvez les adapter à tout moment.",
    messageWindowsSaved: "Horaires d'envoi enregistrés.",
    appointmentWindowsSaved: "Plages de rendez-vous enregistrées.",
    durationsSaved: "Durées des rendez-vous enregistrées.",
    instructionsSaved: "Consignes enregistrées.",
    contactAdded: "Contact d'urgence ajouté.",
    contactRemoved: "Contact retiré.",
    alertsSaved: "Règles d'alerte enregistrées.",
    onCallAdded: "Garde ajoutée au planning.",
    onCallRemoved: "Garde retirée du planning.",
    connected: "Connexion simulée enregistrée.",
    disconnected: "Connexion retirée.",
    teamDone: "Étape équipe terminée.",
  },
  errors: {
    onCallDates: "Indiquez le début et la fin de la garde.",
    onCallOrder: "La fin de la garde doit suivre son début.",
    onCallEnded: "Cette garde est déjà terminée.",
    onCallTooLong: "Une garde dure au plus 14 jours.",
    drvetoCode: "Code du cabinet dr.veto : 3 à 32 lettres, chiffres ou tirets.",
    whatsappPin: "Le code PIN compte exactement 6 chiffres.",
    chooseProtocol: "Choisissez un protocole validé.",
    /** Saisie refusée sans code connu (message par défaut de la validation). */
    invalidInput: "Vérifiez les valeurs saisies.",
  },
  /** Codes renvoyés par les schémas de `domains/reglages/content.ts` et des actions. */
  validation: {
    time_format: "Heure au format HH:MM.",
    end_before_start: "La fin doit suivre le début.",
    one_window_per_day: "Une seule plage par jour.",
    instructions_short: "Consignes : 10 caractères minimum.",
    instructions_long: "Consignes : 1500 caractères maximum.",
    contact_label_short: "Libellé : 2 caractères minimum.",
    contact_label_long: "Libellé : 80 caractères maximum.",
    phone_invalid: "Numéro de téléphone invalide.",
    duration_integer: "Durée : un nombre de minutes entier.",
    duration_min: "Durée : 5 minutes minimum.",
    duration_max: "Durée : 120 minutes maximum.",
    duration_step: "Durée : par pas de 5 minutes.",
    on_call_vet_required: "Choisissez le vétérinaire de garde.",
  },
  onboarding: {
    title: "Démarrage guidé",
    description:
      "Huit étapes, de cinq à quinze minutes avec les réglages de départ. Chaque réglage reste modifiable ensuite.",
    progress: (done: number, total: number) =>
      `${done} étape(s) terminée(s) sur ${total}`,
    ready: {
      title: "Votre cabinet est prêt.",
      body: "Vous pouvez lancer vos premiers suivis.",
    },
    simulated: {
      title: "Connexions simulées pendant cette phase.",
      body: "Aucun numéro WhatsApp, cabinet dr.veto ou compte bancaire réel n'est contacté.",
    },
    done: "terminée",
    todo: "à faire",
    steps: {
      organization: "Cabinet et compte administrateur",
      whatsapp: "Connexion WhatsApp Business",
      drveto: "Connexion dr.veto",
      rules: "Horaires, urgences, garde et alertes",
      team: "Utilisateurs et droits",
      protocols: "Protocoles de départ",
      billing: "Mandat de prélèvement et facturation",
      test_followup: "Premier suivi test",
    },
    organization:
      "Créés à l'inscription. Vous êtes vétérinaire administrateur.",
    rules: {
      body: "Horaires d'envoi de Numa, consignes d'urgence pour la journée, la nuit, le week-end et les jours fériés, contacts d'urgence, planning de garde et délai d'escalade.",
      missingWindows: "les horaires d'envoi",
      missingInstructions: "les consignes d'urgence",
      missingContact: "un contact d'urgence",
      toComplete: (items: readonly string[]) =>
        `À compléter : ${items.join(", ")}.`,
      open: "Ouvrir les réglages",
    },
    team: {
      body: "Invitez vos vétérinaires et assistants, ou passez cette étape si vous exercez sans équipe. Vous pourrez inviter plus tard.",
      ready: "L'équipe est prête",
      open: "Ouvrir l'équipe",
    },
    protocols: {
      body: "Ajoutez les modèles de la bibliothèque, relisez-les et validez au moins un protocole du cabinet. Un protocole non validé ne sert à aucun suivi.",
      open: "Ouvrir les protocoles",
    },
    testFollowup: {
      body: "Un animal et un propriétaire fictifs, en brouillon : le suivi test n'envoie aucun message, n'est pas compté et n'est pas facturé.",
      notAllowed: "Le lancement de suivis n'est pas dans vos droits.",
      validateFirst: "Validez d'abord un protocole du cabinet.",
      protocol: "Protocole du suivi test",
      create: "Créer le suivi test",
    },
  },
};
