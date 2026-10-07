/**
 * Textes du site public en français (langue de référence).
 * Règles : prix et règles issus du cahier des charges uniquement, aucune promesse chiffrée non
 * validée, aucune intégration présentée comme disponible avant son lancement, Numa et Stive
 * toujours présentés comme des IA qui ne prennent aucune décision médicale.
 * Les valeurs entre accolades ({price}, {months}…) sont remplacées à l'affichage.
 */
export const fr = {
  meta: {
    home: {
      title: "Le suivi post-consultation des cabinets vétérinaires",
      description:
        "Stivea Vet suit vos patients après l'intervention sur WhatsApp avec Numa, assistante IA, et prépare des synthèses utiles pour vos consultations.",
    },
    how: {
      title: "Fonctionnement",
      description:
        "Du lancement d'un suivi à la synthèse pré-consultation : comment Stivea Vet s'insère dans la journée du cabinet.",
    },
    numa: {
      title: "Numa, assistante IA des propriétaires",
      description:
        "Numa échange avec les propriétaires sur WhatsApp au nom du cabinet. Elle se présente comme une IA et ne prend jamais de décision médicale.",
    },
    stive: {
      title: "Stive, assistant IA de l'équipe",
      description:
        "Stive aide les vétérinaires et l'équipe dans Stivea Vet : point du jour, résumé de dossier, brouillons. Toute action réelle est confirmée par un vétérinaire.",
    },
    integrations: {
      title: "Intégrations",
      description:
        "dr.veto au lancement, Vétocom et Vetup bientôt disponibles, WhatsApp Business du cabinet.",
    },
    pricing: {
      title: "Tarifs",
      description:
        "Essai pilote à 86 € HT par mois pendant 2 mois, puis Solo, Solo Pro, Clinique ou Clinique Pro. Prix HT, par cabinet.",
    },
    security: {
      title: "Sécurité et données",
      description:
        "Isolation des cabinets, comptes et droits séparés, journal d'activité, hébergement en Europe, conservation d'un an maximum.",
    },
    help: {
      title: "Centre d'aide",
      description: "Guides et assistance Stivea Vet.",
    },
    status: {
      title: "État de Stivea Vet",
      description: "Pannes et maintenances de Stivea Vet.",
    },
    trial: {
      title: "Commencer l'essai",
      description:
        "Essai pilote de 2 mois à 86 € HT par mois, en usage réel et sans engagement.",
    },
    demo: {
      title: "Demander la démo",
      description:
        "Découvrez Stivea Vet sur un cabinet fictif, en lecture seule.",
    },
    demoSpace: {
      title: "Démo",
      description: "Démo de Stivea Vet sur données fictives.",
    },
    terms: {
      title: "Conditions d'utilisation",
      description: "Conditions d'utilisation de Stivea Vet (projet).",
    },
    privacy: {
      title: "Confidentialité",
      description: "Politique de confidentialité de Stivea Vet (projet).",
    },
    unsubscribe: {
      title: "Désinscription",
      description: "Ne plus recevoir les e-mails de Stivea Vet.",
    },
  },

  common: {
    brandVet: "vet",
    skipToContent: "Aller au contenu",
    ctaTrial: "Commencer l'essai à {price} HT",
    ctaDemo: "Voir la démo",
    login: "Connexion",
    numaAi: "Assistante IA",
    stiveAi: "Assistant IA",
    exclVat: "HT",
    perMonth: "par mois",
    soon: "Bientôt disponible",
    atLaunch: "Au lancement",
    fictionalData: "Données fictives",
    appInFrench: "",
  },

  nav: {
    label: "Navigation principale",
    menu: "Menu",
    links: {
      how: "Fonctionnement",
      numa: "Numa",
      stive: "Stive",
      integrations: "Intégrations",
      pricing: "Tarifs",
      security: "Sécurité",
    },
    switchLanguage: "English",
    switchLanguageLabel: "Read this page in English",
  },

  footer: {
    tagline:
      "Le suivi post-consultation des cabinets vétérinaires, avec Numa et Stive, deux assistants IA au service de votre équipe.",
    product: "Produit",
    resources: "Ressources",
    legal: "Informations",
    links: {
      demo: "Démo",
      trial: "Essai pilote",
      help: "Centre d'aide",
      status: "État du service",
      login: "Connexion",
      terms: "Conditions d'utilisation",
      privacy: "Confidentialité",
    },
    fictional:
      "Version de démonstration : toutes les données affichées sont fictives.",
    rights: "© 2026 Stivea Vet",
  },

  home: {
    hero: {
      eyebrow: "Suivi post-consultation · chiens et chats",
      title: "Vos patients suivis après l'intervention,",
      titleAccent: "sans alourdir votre journée.",
      lead: "Numa, assistante IA, échange avec les propriétaires sur le WhatsApp professionnel du cabinet. Elle suit votre protocole, repère les signes d'alerte et vous prépare une synthèse. La décision médicale reste toujours la vôtre.",
      points: [
        "2 mois d'essai en usage réel",
        "Sans engagement pendant l'essai",
        "Installation guidée",
      ],
    },
    phone: {
      label: "Exemple de conversation WhatsApp avec Numa (fictive)",
      cabinet: "Clinique des Tilleuls",
      channel: "WhatsApp Business",
      simulated: "Conversation fictive",
      messages: [
        {
          from: "numa",
          text: "Bonjour Julien, je suis Numa, l'assistante IA de la Clinique des Tilleuls. Comment va Caramel ce matin ?",
          time: "9 h 00",
        },
        {
          from: "owner",
          text: "Bonne nuit, elle a mangé la moitié de sa ration.",
          time: "9 h 14",
        },
        {
          from: "numa",
          text: "Merci, c'est transmis à l'équipe. Pourriez-vous m'envoyer une photo de la cicatrice ?",
          time: "9 h 15",
        },
        {
          from: "owner",
          text: "📷 Photo · La plaie est un peu rouge.",
          time: "9 h 31",
        },
      ],
    },
    alert: {
      level: "À surveiller",
      title: "Caramel · J+1 · ovariectomie",
      body: "Rougeur signalée sur la cicatrice, photo reçue.",
      footer: "Dr Fontaine prévenue sur l'ordinateur du cabinet",
    },
    beforeAfter: {
      title: "Ce qui change pour le cabinet",
      lead: "Les appels de suivi et les messages dispersés laissent place à un suivi structuré, visible par l'équipe.",
      beforeTitle: "Aujourd'hui",
      afterTitle: "Avec Stivea Vet",
      before: [
        "Des appels de suivi qui prennent du temps et n'aboutissent pas toujours",
        "Des photos reçues sur un téléphone personnel",
        "Une complication découverte au contrôle, parfois tard",
        "Un dossier à reconstituer avant la consultation",
      ],
      after: [
        "Numa pose les questions de votre protocole, au bon moment",
        "Messages, photos et vocaux rangés dans le dossier du suivi",
        "Les signes d'alerte remontent en priorité sur le tableau de bord",
        "Une synthèse prête quand vous ouvrez le dossier",
      ],
    },
    assistants: {
      title: "Deux assistants IA, un seul cadre : le vôtre",
      lead: "Numa parle aux propriétaires, Stive aide l'équipe. Aucun des deux ne pose de diagnostic ni ne prend de décision médicale.",
      numa: {
        role: "Échange avec les propriétaires sur WhatsApp",
        points: [
          "Se présente comme une IA dès le premier message",
          "Demande l'accord du propriétaire avant tout suivi",
          "Suit le protocole validé par le vétérinaire",
          "Transmet immédiatement les consignes d'urgence du cabinet",
        ],
        link: "Découvrir Numa",
      },
      stive: {
        role: "Aide les vétérinaires et l'équipe dans Stivea Vet",
        points: [
          "Prépare le point du jour et les résumés de dossier",
          "Propose des brouillons de message et de rendez-vous",
          "Ne voit que ce que chaque personne a le droit de voir",
          "Toute action réelle est confirmée par un vétérinaire",
        ],
        link: "Découvrir Stive",
      },
    },
    steps: {
      title: "Un suivi lancé en quelques clics",
      items: [
        {
          title: "Choisir l'animal",
          body: "L'animal, ses propriétaires et l'intervention sont repris de dr.veto, en lecture seule.",
        },
        {
          title: "Valider le protocole",
          body: "Questions, rappels, signes d'alerte et contrôle : vous ajustez tout, puis cliquez sur « Lancer le suivi ».",
        },
        {
          title: "Numa accompagne",
          body: "Elle échange avec le propriétaire, trie chaque message en normal, à surveiller ou urgent, et vous alerte si besoin.",
        },
        {
          title: "Vous décidez",
          body: "Vous reprenez la conversation quand vous voulez. La synthèse vous attend avant le contrôle.",
        },
      ],
      link: "Voir le fonctionnement en détail",
    },
    principles: {
      title: "Nos engagements",
      items: [
        {
          title: "Le vétérinaire décide",
          body: "Numa et Stive ne diagnostiquent pas, ne touchent jamais une posologie et ne rassurent jamais hors du cadre que vous avez validé.",
        },
        {
          title: "Transparence pour le propriétaire",
          body: "Numa se présente comme une IA et recueille l'accord avant tout suivi. Le propriétaire peut écrire STOP à tout moment.",
        },
        {
          title: "Rien sur votre téléphone personnel",
          body: "Tout reste dans Stivea Vet. Seules les alertes urgentes partent sur le numéro professionnel que vous avez choisi.",
        },
        {
          title: "Un propriétaire n'est jamais abandonné",
          body: "Un impayé ou une résiliation n'interrompt jamais un suivi en cours.",
        },
      ],
    },
    securityTeaser: {
      title: "Des données de santé animale traitées avec le plus grand soin",
      points: [
        "Chaque cabinet est strictement isolé des autres",
        "Comptes personnels, droits fins et dossiers privés",
        "Journal d'activité pour l'administrateur",
        "Hébergement en Europe, conservation d'un an maximum",
        "Jamais d'entraînement de modèle d'IA sur vos données",
      ],
      link: "Lire la page sécurité",
    },
    faq: {
      title: "Questions fréquentes",
      items: [
        {
          q: "Numa peut-elle donner un avis médical ?",
          a: "Non. Numa pose les questions de votre protocole, recueille les réponses, photos et vocaux, et vous alerte. Elle ne diagnostique pas et ne modifie jamais un traitement. En cas d'urgence, elle transmet les consignes et coordonnées d'urgence de votre cabinet.",
        },
        {
          q: "Le propriétaire sait-il qu'il parle à une IA ?",
          a: "Oui, dès le premier message. Numa demande aussi son accord avant de commencer le suivi, et il peut l'arrêter à tout moment en écrivant STOP.",
        },
        {
          q: "Faut-il changer de logiciel vétérinaire ?",
          a: "Non. Stivea Vet se connecte à dr.veto au lancement, en lecture seule, et n'y écrit jamais. Vétocom et Vetup arrivent ensuite.",
        },
        {
          q: "Combien coûte l'essai ?",
          a: "{price} HT par mois pendant 2 mois, en usage réel, résiliable à tout moment. Aucun engagement annuel n'est créé automatiquement.",
        },
        {
          q: "Que se passe-t-il la nuit et le week-end ?",
          a: "Numa répond aux propriétaires à toute heure. Les messages programmés respectent vos horaires. En cas d'urgence, elle transmet immédiatement vos consignes de nuit, de week-end ou de jour férié.",
        },
      ],
    },
    finalCta: {
      title: "Essayez Stivea Vet sur vos vrais suivis",
      body: "2 mois à {price} HT par mois, sans engagement. Vous pouvez aussi découvrir d'abord la démo, sur un cabinet fictif.",
    },
  },

  how: {
    title: "Comment fonctionne Stivea Vet",
    lead: "Stivea Vet s'utilise sur l'ordinateur du cabinet. Vous gardez la main à chaque étape ; Numa et Stive font le reste du travail répétitif.",
    journeyTitle: "Le parcours d'un suivi",
    journey: [
      {
        title: "Ouvrir Stivea Vet et choisir l'animal",
        body: "La recherche porte sur les animaux de dr.veto. Les informations utiles sont importées en lecture seule : animal, propriétaires, intervention, rendez-vous de contrôle, allergies et traitements actifs.",
      },
      {
        title: "Vérifier la fiche de lancement",
        body: "Stivea Vet propose un protocole, un premier message, des questions, des rappels et des alertes. Vous modifiez ce que vous voulez et vous cliquez vous-même sur « Lancer le suivi ».",
      },
      {
        title: "L'accord du propriétaire",
        body: "Numa écrit depuis le WhatsApp Business du cabinet, au nom du cabinet et du vétérinaire responsable. Le suivi clinique ne commence qu'après l'accord du propriétaire.",
      },
      {
        title: "Le suivi au quotidien",
        body: "Le propriétaire répond par texte, photo ou vocal. Tout est rangé dans le dossier. Les messages programmés respectent vos horaires ; Numa répond aux messages entrants à toute heure.",
      },
      {
        title: "La synthèse avant le contrôle",
        body: "En ouvrant le dossier, vous retrouvez l'évolution, les signaux positifs et négatifs, les alertes et les questions ouvertes. Rien n'est écrit automatiquement dans dr.veto.",
      },
    ],
    triageTitle: "Trois niveaux, jamais d'alarme inutile",
    triage: [
      {
        level: "normal",
        name: "Normal",
        where: "Visible dans le dossier et la liste des suivis",
        notify: "Aucune interruption",
      },
      {
        level: "watch",
        name: "À surveiller",
        where: "Prioritaire dans le tableau de bord",
        notify: "Petite notification sur l'ordinateur",
      },
      {
        level: "urgent",
        name: "Urgent",
        where: "Très visible dans Stivea Vet",
        notify:
          "Alerte WhatsApp immédiate au vétérinaire responsable ou de garde",
      },
    ],
    triageHeaders: {
      level: "Niveau",
      where: "Dans Stivea Vet",
      notify: "Notification",
    },
    triageNote:
      "Vous validez les signes d'alerte de chaque protocole. En cas de doute, Numa escalade. Sans accusé de réception, les autres vétérinaires sont alertés après le délai que vous choisissez, entre 3 et 5 heures ; les consignes d'urgence au propriétaire, elles, partent immédiatement.",
    controlTitle: "Vous gardez la main",
    control: [
      "Vous écrivez dans la conversation quand vous voulez : votre message part depuis le WhatsApp du cabinet.",
      "Dès que vous reprenez la conversation, Numa se met en pause jusqu'à ce que vous cliquiez sur « Reprendre Numa ».",
      "Un suivi se met en pause, s'arrête ou reprend à tout moment.",
      "Deux propriétaires peuvent suivre le même animal, chacun avec son propre accord.",
    ],
  },

  numa: {
    title: "Numa, l'assistante IA qui accompagne vos propriétaires",
    lead: "Numa échange avec les propriétaires sur le WhatsApp professionnel du cabinet, au nom du cabinet. Elle est chaleureuse, transparente et toujours dans le cadre que vous avez validé.",
    doesTitle: "Ce que fait Numa",
    does: [
      "Se présente comme une IA dès le premier message et recueille l'accord du propriétaire",
      "Pose les questions de votre protocole et envoie les rappels au bon moment",
      "Reçoit textes, photos et vocaux ; les vocaux sont transcrits et rangés dans le dossier",
      "Classe chaque message en normal, à surveiller ou urgent, et escalade en cas de doute",
      "Transmet immédiatement les consignes et coordonnées d'urgence du cabinet, y compris hors horaires",
      "Propose un créneau dans les plages que vous avez approuvées, d'abord avec le vétérinaire de l'animal",
      "Écrit en français ou en anglais selon le propriétaire ; vous pouvez corriger la langue",
    ],
    neverTitle: "Ce que Numa ne fera jamais",
    never: [
      "Poser un diagnostic",
      "Créer ou modifier une posologie ou un traitement",
      "Rassurer médicalement en dehors du cadre que vous avez validé",
      "Se faire passer pour un humain",
      "Continuer une conversation que vous avez reprise, sans votre accord",
    ],
    consentTitle: "Le propriétaire garde la main",
    consent:
      "Le propriétaire peut écrire STOP à tout moment pour suspendre les relances ; REPRENDRE permet de recréer un accord. Quand deux propriétaires suivent le même animal, chacun donne son accord et la conséquence d'un groupe WhatsApp commun leur est expliquée avant.",
    photoTitle: "Photos : observation, jamais diagnostic",
    photo:
      "L'analyse de photo assistée est désactivée par défaut. Si vous l'activez, Numa ne fournit que des observations et des signaux de risque.",
  },

  stive: {
    title: "Stive, l'assistant IA de votre équipe",
    lead: "Stive travaille dans Stivea Vet, à côté de vous. Il connaît les suivis, l'agenda et les alertes auxquels vous avez accès, et vous aide à préparer la journée.",
    canTitle: "Ce que Stive prépare pour vous",
    can: [
      "Le point du jour : suivis prioritaires, alertes en attente, contrôles prévus",
      "Le résumé d'un dossier avant une consultation",
      "Une proposition de rendez-vous ou un brouillon de message",
      "Une modification de suivi à valider",
    ],
    ruleTitle: "Une règle simple",
    rule: "Toute action qui a un effet réel est confirmée explicitement par un vétérinaire autorisé. Stive prépare, vous décidez.",
    accessTitle: "Il ne voit que ce que vous voyez",
    access:
      "Stive respecte les droits de chaque personne : un assistant n'accède pas aux données cliniques qui ne lui sont pas ouvertes, et un dossier privé reste privé.",
    limitTitle: "Une utilisation adaptée à chaque formule",
    limit:
      "Chaque formule comprend un usage de Stive adapté à la taille du cabinet. Si vous atteignez cette limite, Stivea Vet vous propose la formule supérieure.",
  },

  integrations: {
    title: "Intégrations",
    lead: "Stivea Vet s'appuie sur les outils que le cabinet utilise déjà. Les données importées sont lues, jamais modifiées.",
    items: [
      {
        name: "dr.veto",
        status: "launch",
        body: "Connexion directe au lancement : animal, propriétaires, intervention, traitements et agenda, en lecture seule. Numa peut proposer un créneau ; aucun résumé n'est écrit dans dr.veto.",
      },
      {
        name: "WhatsApp Business",
        status: "launch",
        body: "Numa écrit depuis le numéro WhatsApp Business professionnel du cabinet. Votre WhatsApp personnel n'est jamais utilisé.",
      },
      {
        name: "Vétocom",
        status: "soon",
        body: "Intégration en préparation.",
      },
      {
        name: "Vetup",
        status: "soon",
        body: "Intégration en préparation.",
      },
    ],
    screenshotTitle: "En attendant votre logiciel : une capture d'agenda",
    screenshot:
      "Sans intégration agenda, le cabinet peut envoyer une capture d'écran de ses créneaux libres. Stivea Vet en extrait les créneaux puis supprime la capture ; Numa propose un créneau et le cabinet le confirme. Pensez à masquer toute information inutile.",
  },

  pricing: {
    title: "Des tarifs simples, par cabinet",
    lead: "Tous les prix sont hors taxes, facturés par cabinet et prélevés chaque mois. Les factures sont envoyées par e-mail.",
    trial: {
      badge: "Pour commencer",
      name: "Essai pilote",
      price: "{price} HT par mois pendant {months} mois",
      points: [
        "Usage réel, sur vos vrais suivis",
        "Sans engagement, résiliable à tout moment",
        "Puis la formule choisie à l'inscription",
      ],
    },
    plansTitle: "Après l'essai",
    annual: "avec engagement annuel",
    monthly: "sans engagement",
    perMonthExclVat: "HT / mois",
    plans: {
      solo: { name: "Solo", vets: "1 vétérinaire", stive: "Stive limité" },
      solo_pro: {
        name: "Solo Pro",
        vets: "1 vétérinaire",
        stive: "Stive plus complet",
      },
      clinic: {
        name: "Clinique",
        vets: "Jusqu'à 3 vétérinaires",
        stive: "Un Stive par vétérinaire, avec une limite plus basse",
      },
      clinic_pro: {
        name: "Clinique Pro",
        vets: "Jusqu'à 3 vétérinaires",
        stive: "Un Stive personnel plus complet par vétérinaire",
      },
    },
    larger: {
      name: "Plus de 3 vétérinaires",
      body: "Forfait adapté au cabinet, sur demande.",
    },
    usageTitle: "Suivis Numa",
    usage: [
      "{included} suivis actifs en même temps sont inclus dans chaque formule.",
      "Au-delà, chaque nouveau suivi lancé coûte {launch} HT.",
      "Réactiver un ancien suivi alors que {included} suivis sont actifs coûte {reactivation} HT.",
      "Le supplément est prélevé avec l'abonnement suivant. Quand un suivi se termine, une place se libère.",
    ],
    rulesTitle: "Les règles de l'abonnement",
    rules: [
      "Les six premiers mois ne créent jamais d'engagement annuel automatique.",
      "À partir du 3e mois, vous pouvez demander l'engagement annuel. Avant le 7e mois, vous choisissez : engagement annuel ou formule mensuelle.",
      "Après un prélèvement échoué, vous avez 30 jours pour régulariser avant le blocage des nouveaux suivis.",
      "Après une résiliation ou un impayé, les suivis en cours continuent toujours, puis vous gardez un accès en lecture seule pendant 3 mois.",
    ],
    noFree:
      "Il n'existe pas d'accès gratuit aux fonctions réelles. La démo, elle, est gratuite, sur un cabinet fictif.",
  },

  security: {
    title: "Sécurité et données",
    lead: "Stivea Vet traite des informations sur des animaux et leurs propriétaires. Chaque choix technique part de ce constat.",
    sections: [
      {
        title: "Isolation des cabinets",
        body: "Chaque cabinet est isolé des autres jusque dans la base de données : une requête ne peut lire que les données de son propre cabinet.",
      },
      {
        title: "Comptes et droits",
        body: "Chaque personne a son propre compte. Les vétérinaires se connectent avec un mot de passe et un code de sécurité ; les assistants ont des droits limités, que l'administrateur peut ouvrir. Un vétérinaire peut marquer un dossier comme privé.",
      },
      {
        title: "Verrouillage automatique",
        body: "Stivea Vet se verrouille après 40 minutes sans activité ; le mot de passe est demandé pour reprendre.",
      },
      {
        title: "Journal d'activité",
        body: "Consultations, modifications et messages sont tracés. L'administrateur du cabinet consulte ce journal ; personne ne peut le modifier.",
      },
      {
        title: "Hébergement et conservation",
        body: "Les données sont hébergées en Europe et chiffrées en transit et au repos. L'historique identifiable est conservé un an au maximum ; ensuite, seules des statistiques anonymisées demeurent.",
      },
      {
        title: "Vos données ne servent pas à entraîner d'IA",
        body: "Conversations, photos, vocaux et données de suivi ne servent jamais à entraîner un modèle d'IA externe.",
      },
      {
        title: "Sauvegardes",
        body: "Des sauvegardes chiffrées sont faites chaque jour en Europe et conservées 90 jours. Une donnée supprimée l'est immédiatement de la production, puis des sauvegardes au plus tard à la fin de ce cycle.",
      },
      {
        title: "Droits des propriétaires",
        body: "À la demande d'un propriétaire, Stivea Vet supprime ses données de suivi. Le dossier médical source reste sous la responsabilité du cabinet dans son logiciel.",
      },
    ],
    incidentsTitle: "En cas d'incident",
    incidents:
      "Le vétérinaire administrateur est prévenu par e-mail immédiatement en cas d'incident de sécurité. Les pannes et maintenances sont publiées sur la page État de Stivea Vet.",
  },

  help: {
    title: "Centre d'aide",
    lead: "Les guides et vidéos arrivent avec l'ouverture de l'essai pilote. Ils seront aussi disponibles dans le logiciel.",
    topics: [
      "Installer Stivea Vet pas à pas",
      "Lancer et suivre un premier suivi",
      "Régler les horaires, la garde et les consignes d'urgence",
      "Gérer l'équipe et les droits",
      "Facturation et abonnement",
    ],
    soon: "En préparation",
    supportTitle: "Assistance",
    support:
      "L'assistance répond par la messagerie intégrée et par e-mail, les jours ouvrés, sous 24 à 48 heures ouvrées.",
  },

  status: {
    title: "État de Stivea Vet",
    lead: "Cette page publiera les pannes et les maintenances prévues dès l'ouverture du service.",
    components: [
      "Application Stivea Vet",
      "Conversations WhatsApp",
      "Connexion dr.veto",
      "E-mails",
    ],
    notOpen: "Service pas encore ouvert",
    history: "Aucun incident publié.",
  },

  trial: {
    title: "Commencer l'essai pilote",
    lead: "{months} mois à {price} HT par mois, sur vos vrais suivis, sans engagement.",
    stepsTitle: "Comment ça se passe",
    steps: [
      "Vous créez le cabinet et votre compte de vétérinaire administrateur, et choisissez la formule qui suivra l'essai.",
      "Vous acceptez les conditions d'utilisation et confirmez être autorisé à souscrire au nom du cabinet.",
      "Vous arrivez directement dans l'installation guidée : WhatsApp, dr.veto, horaires, équipe, protocoles, mandat de prélèvement et premier suivi test.",
    ],
    reassuranceTitle: "Bon à savoir",
    reassurance: [
      "L'essai est résiliable à tout moment.",
      "Aucun engagement annuel n'est créé automatiquement pendant les six premiers mois.",
      "Un suivi en cours n'est jamais interrompu, même en cas de résiliation.",
    ],
    cta: "Créer mon cabinet",
    demoInstead: "Préférez-vous voir la démo d'abord ?",
  },

  demo: {
    title: "Découvrez Stivea Vet sur un cabinet fictif",
    lead: "La démo montre le tableau de bord, des suivis et une conversation avec Numa, en lecture seule. Aucun WhatsApp réel, aucune connexion dr.veto, aucune donnée réelle.",
    form: {
      email: "Adresse e-mail professionnelle",
      cabinet: "Nom du cabinet",
      vets: "Nombre de vétérinaires",
      vetOptions: { "1": "1", "2": "2", "3": "3", "4": "Plus de 3" },
      submit: "Ouvrir la démo",
      pending: "Ouverture…",
      notice:
        "Nous vous enverrons ensuite cinq e-mails sur deux semaines pour présenter Stivea Vet. Désinscription en un clic à tout moment. Vos informations sont supprimées après un an.",
      privacyLink: "Confidentialité",
    },
    errors: {
      email: "Saisissez une adresse e-mail valide.",
      too_long: "Adresse trop longue.",
      cabinet_short: "Indiquez le nom du cabinet.",
      cabinet_long: "Nom du cabinet trop long.",
      vets: "Choisissez le nombre de vétérinaires.",
      rate_limited:
        "Trop de demandes depuis cette connexion. Réessayez dans une heure.",
      expired:
        "Votre accès à la démo a expiré ou n'est plus valable. Redemandez-le ci-dessous.",
    },
    space: {
      banner:
        "Démo en lecture seule : le cabinet, les animaux, les propriétaires et les conversations sont fictifs.",
      welcome: "Bienvenue, {cabinet}",
      intro:
        "Voici une journée type à la Clinique vétérinaire des Tilleuls, un cabinet fictif de trois vétérinaires.",
      prioritiesTitle: "Suivis prioritaires",
      prioritiesHint: "Ouvrez un suivi pour lire la conversation avec Numa.",
      agendaTitle: "Agenda du jour",
      agendaHint:
        "Rendez-vous issus de dr.veto ; ceux proposés via Stivea Vet sont signalés.",
      conversationTitle: "Conversation avec Numa",
      synthesisTitle: "Synthèse pour le vétérinaire",
      positives: "Signaux positifs",
      negatives: "Points d'attention",
      alerts: "Alertes",
      questions: "Questions ouvertes",
      back: "Revenir aux suivis",
      languageNote: "",
      ctaTitle: "Prêt à essayer sur vos vrais suivis ?",
    },
  },

  legal: {
    draft:
      "Projet de document, à faire valider par un juriste spécialisé avant toute commercialisation. Il ne constitue pas encore un engagement contractuel.",
    updated: "Version de travail du 7 octobre 2026",
  },

  terms: {
    title: "Conditions d'utilisation",
    sections: [
      {
        title: "Objet",
        body: "Stivea Vet fournit aux cabinets vétérinaires un logiciel de suivi post-consultation, avec Numa, assistante IA qui échange avec les propriétaires, et Stive, assistant IA de l'équipe.",
      },
      {
        title: "Souscription",
        body: "La personne qui souscrit confirme être autorisée à engager le cabinet. Le cabinet est responsable de ses utilisateurs, qui disposent chacun d'un compte personnel.",
      },
      {
        title: "Responsabilité médicale",
        body: "Le vétérinaire garde toujours la décision médicale. Le cabinet est responsable de ses protocoles, de ses signes d'alerte et de ses consignes d'urgence. Numa et Stive ne posent aucun diagnostic et ne modifient aucun traitement.",
      },
      {
        title: "Essai, formules et paiement",
        body: "L'essai pilote dure 2 mois et reste résiliable à tout moment. Les prix sont hors taxes, par cabinet, prélevés chaque mois. Aucun engagement annuel n'est créé automatiquement pendant les six premiers mois.",
      },
      {
        title: "Impayé et résiliation",
        body: "Les suivis en cours continuent toujours. Après un prélèvement échoué, le cabinet dispose de 30 jours pour régulariser avant le blocage des nouveaux suivis. Après le dernier suivi, un accès en lecture seule reste ouvert 3 mois.",
      },
    ],
  },

  privacy: {
    title: "Confidentialité",
    sections: [
      {
        title: "Données des cabinets et des propriétaires",
        body: "Le cabinet reste responsable des données de ses patients et de leurs propriétaires ; Stivea Vet les traite pour son compte, dans le cadre d'un contrat de sous-traitance.",
      },
      {
        title: "Conservation",
        body: "L'historique identifiable d'un suivi est conservé un an au maximum. Ensuite, seules des statistiques anonymisées demeurent.",
      },
      {
        title: "Aucun entraînement d'IA",
        body: "Les conversations, photos, vocaux et données de suivi ne servent jamais à entraîner un modèle d'IA externe.",
      },
      {
        title: "Demandes de démo",
        body: "Pour la démo, nous conservons votre adresse e-mail, le nom du cabinet, le nombre de vétérinaires et la langue, pendant un an au maximum. Ils servent à ouvrir la démo et à envoyer cinq e-mails sur deux semaines, auxquels vous pouvez vous désinscrire à tout moment. La séquence s'arrête dès le démarrage d'un essai.",
      },
      {
        title: "Vos droits",
        body: "Vous pouvez demander l'accès, la rectification ou la suppression de vos données. Les modalités de contact seront précisées avant l'ouverture du service.",
      },
    ],
  },

  unsubscribe: {
    title: "Ne plus recevoir nos e-mails",
    body: "Confirmez pour arrêter la série d'e-mails qui suit votre demande de démo. Vous ne recevrez plus d'e-mail de présentation de Stivea Vet à cette adresse.",
    submit: "Me désinscrire",
    done: "C'est fait : vous ne recevrez plus nos e-mails de présentation.",
    invalid:
      "Ce lien de désinscription n'est pas valable. Utilisez le lien du dernier e-mail reçu.",
  },
};
