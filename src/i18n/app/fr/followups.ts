/** Textes de cette partie de l'espace cabinet (voir ADR 0022). */
export const followups = {
  title: "Suivis",
  /** Liste des suivis. */
  list: {
    descriptionClinical: "Les suivis que vous pouvez consulter.",
    descriptionSummary:
      "Vue d'organisation : animal, propriétaire, état et responsable. Les données cliniques sont réservées aux vétérinaires.",
    launch: "Lancer un suivi",
    emptyTitle: "Aucun suivi à afficher",
    emptyDescription:
      "Les suivis dont vous êtes responsable ou qui vous sont partagés apparaîtront ici.",
    private: "Privé",
    controlOn: (date: string) => `Contrôle le ${date}`,
    controlNone: "Contrôle non programmé",
  },
  /** Suivi test de l'installation. */
  testMark: "Suivi test",
  /** Recherche dr.veto avant la fiche de lancement. */
  create: {
    title: "Lancer un suivi",
    back: "Suivis",
    description:
      "Cherchez l'animal dans dr.veto. Stivea Vet importe en lecture seule le résumé utile, puis vous proposez une fiche de lancement à relire.",
    searchLabel: "Animal, propriétaire ou identifiant dr.veto",
    searchPlaceholder: "Ex. Plume, Girard, DV-20481",
    search: "Rechercher",
    simulatedNote:
      "dr.veto simulé : animaux et propriétaires fictifs, aucun appel au vrai logiciel.",
    notConnectedTitle: "dr.veto n'est pas encore connecté",
    openSettings: "Ouvrir les réglages",
    notConnectedBody:
      "Connectez le logiciel du cabinet pour retrouver vos patients.",
    found: (count: number) =>
      `${count} animal${count > 1 ? "aux" : ""} trouvé${count > 1 ? "s" : ""}`,
    noResults: "Aucun résultat",
    noMatchTitle: "Aucun animal ne correspond",
    noMatchDescription:
      "Vérifiez l'orthographe ou cherchez par le nom du propriétaire.",
    openFollowupLabel: (name: string) => `Ouvrir le suivi de ${name}`,
    alreadyOpen: "Suivi déjà ouvert",
    prepareLabel: (name: string) => `Préparer la fiche de ${name}`,
    prepare: "Préparer la fiche",
  },
  /** Page de la fiche de lancement. */
  sheet: {
    title: "Fiche de lancement",
    back: (name: string) => `Dossier de ${name}`,
    draftHeading: (name: string) => `Fiche de lancement de ${name}`,
    editHeading: (name: string) => `Modifier le suivi de ${name}`,
    responsible: "Responsable :",
    saved: "Fiche enregistrée.",
    protocolApplied:
      "Protocole appliqué : étapes et signes d'alerte repris de sa version.",
    endedTitle: "Suivi terminé",
    endedBody: "Réactivez-le depuis le dossier pour modifier ses étapes.",
    noProtocolTitle: "Choisissez un protocole",
    noProtocolBody:
      "Aucun protocole validé ne correspond à l'intervention importée. Choisissez-en un pour composer la fiche.",
    restrictedTitle: "Modification réservée",
    restrictedBody: "Un suivi lancé ne se modifie que par un vétérinaire.",
    protocolTitle: "Protocole",
    protocolVersion: (name: string, version: number) =>
      `${name}, version ${version}`,
    protocolFrozen:
      "Version figée au lancement. Les modifications ne concernent que ce suivi.",
  },
  /** Résumé importé de dr.veto, à côté de la fiche. */
  imported: {
    title: "Résumé importé de dr.veto",
    importedOn: (date: string) => `Lecture seule · import du ${date} (simulé)`,
    notImported: "Suivi créé dans Stivea Vet, sans import.",
    animal: "Animal",
    procedure: "Intervention",
    procedureOn: (procedure: string, date: string) =>
      `${procedure}, le ${date}`,
    owners: "Propriétaires",
    whatsapp: (phone: string) => `· WhatsApp ${phone}`,
    /** Langue du propriétaire, d'après `labels.languages`. */
    ownerLanguage: (language: string) =>
      ` · ${language.toLocaleLowerCase("fr")}`,
    secondInactive: " · second contact, inactif",
    allergies: "Allergies",
    noAllergies: "Aucune signalée",
    antecedents: "Antécédents",
    noAntecedents: "Aucun signalé",
    externalRef: "Identifiant dr.veto",
    control: "Contrôle prévu",
    controlNone: "Non programmé",
  },
  /** Choix du protocole d'un brouillon. */
  protocolForm: {
    label: "Protocole",
    placeholder: "Choisir un protocole validé",
    option: (name: string, version: number) => `${name} (version ${version})`,
    help: "Seuls les protocoles validés par un vétérinaire et adaptés à l'espèce sont proposés. Changer de protocole remplace les étapes et les signes d'alerte de la fiche.",
    change: "Changer de protocole",
    apply: "Appliquer ce protocole",
  },
  /** Formulaire de la fiche de lancement. */
  form: {
    firstMessageTitle: "Premier message de Numa",
    firstMessageDescription:
      "Numa se présente comme l'assistante IA du cabinet et demande l'accord du propriétaire avant tout suivi clinique.",
    hoursLabel: "Heures après l'intervention",
    firstContactAt: (date: string) =>
      `Suggestion courante : 3 à 4 h. Ici : ${date}.`,
    firstContactAtLaunch: (date: string) =>
      `Suggestion courante : 3 à 4 h. Ici : ${date}, donc dès le lancement.`,
    firstContactDefault: "Suggestion courante : 3 à 4 h, à adapter librement.",
    responsibleLabel: "Vétérinaire responsable",
    responsibleHint:
      "Numa écrit en son nom ; c'est lui ou elle qui lance le suivi.",
    includeSecond: (name: string) => `Inclure ${name}, second propriétaire`,
    secondHint:
      "Numa lui demande aussi son accord. Chacun échange avec Numa (dans un groupe commun si le numéro du cabinet le permet) et peut tout arrêter par STOP ; l'équipe lit tout.",
    optInLabel: (count: number) =>
      count > 1
        ? "Les propriétaires ont accepté au cabinet d'être contactés sur WhatsApp"
        : "Le propriétaire a accepté au cabinet d'être contacté sur WhatsApp",
    optInHint:
      "Obligatoire pour lancer : WhatsApp interdit d'écrire à quelqu'un qui ne l'a pas accepté. Numa demandera ensuite l'accord au suivi lui-même.",
    stepsTitle: "Étapes et questions de Numa",
    stepsDraft:
      "Reprises du protocole. Modifiez-les pour cet animal : le protocole du cabinet ne change pas.",
    stepsLive:
      "Les étapes passées restent telles quelles ; les étapes à venir remplacent les précédentes.",
    alertsTitle: "Signes d'alerte",
    alertsDescription:
      "Validés par le vétérinaire. Numa ne pose jamais de diagnostic : elle signale et, en cas de doute, escalade.",
    treatmentsTitle: "Traitements",
    treatmentsDescription:
      "Un traitement importé de dr.veto n'est rappelé au propriétaire qu'après validation par un vétérinaire. Numa ne modifie jamais une posologie.",
    noTreatments: "Aucun traitement en cours.",
    removedSuffix: " (retiré à l'enregistrement)",
    validatedBy: (name: string) => `Validé par ${name}`,
    toValidate: "Importé de dr.veto, à valider",
    validateTreatment: (name: string) => `Je valide ce traitement : ${name}`,
    keep: "Garder",
    remove: "Retirer",
    keepTreatmentLabel: (name: string) => `Garder le traitement ${name}`,
    removeTreatmentLabel: (name: string) => `Retirer le traitement ${name}`,
    newTreatment: (number: number) => `Nouveau traitement ${number}`,
    newInstructions: (number: number) => `Posologie du traitement ${number}`,
    newValidated: "Validé par vous à l'enregistrement.",
    removeNewLabel: (number: number) =>
      `Retirer le nouveau traitement ${number}`,
    addTreatment: "Ajouter un traitement",
    controlTitle: "Rendez-vous de contrôle",
    controlLabel: "Date et heure du contrôle",
    controlHint:
      "Le suivi automatisé s'arrêtera à cette date ; la discussion restera ouverte. Laissez vide si aucun contrôle n'est prévu.",
    pendingTreatments: (count: number) =>
      count === 1
        ? "1 traitement importé n'est pas encore validé : il ne sera pas rappelé."
        : `${count} traitements importés ne sont pas encore validés : ils ne seront pas rappelés.`,
    launch: "Lancer le suivi",
    saveDraft: "Enregistrer le brouillon",
    saveChanges: "Enregistrer les modifications",
    launchedBy: (name: string) =>
      `Le suivi sera lancé par ${name}, vétérinaire responsable.`,
  },
  /** Refus des actions de lancement ; les limites viennent des règles de la fiche. */
  validation: {
    invalidControl: "Date de contrôle invalide.",
    invalidSheet:
      "Vérifiez la fiche : responsable, date de contrôle après l'intervention et traitements.",
    chooseProtocol: "Choisissez un protocole.",
    firstContactInteger: "Premier message : un nombre d'heures entier.",
    firstContactNegative:
      "Premier message : le délai ne peut pas être négatif.",
    firstContactMax: (max: number) =>
      `Premier message : ${max} heures maximum après l'intervention.`,
    tooManySteps: (max: number) => `${max} étapes au maximum.`,
    stepInteger: "Délai en heures entières.",
    stepNegative: "Le délai ne peut pas être négatif.",
    stepMax: "Délai de 90 jours maximum.",
    stepShort: (min: number) => `Étape : ${min} caractères minimum.`,
    stepLong: (max: number) => `Étape : ${max} caractères maximum.`,
    keepOneAlert: "Gardez au moins un signe d'alerte.",
    tooManyAlerts: (max: number) => `${max} signes d'alerte au maximum.`,
    alertShort: (min: number) => `Signe d'alerte : ${min} caractères minimum.`,
    alertLong: (max: number) => `Signe d'alerte : ${max} caractères maximum.`,
    tooManyTreatments: (max: number) => `${max} traitements au maximum.`,
    treatmentShort: (min: number) =>
      `Traitement : ${min} caractère(s) minimum.`,
    treatmentLong: (max: number) => `Traitement : ${max} caractères maximum.`,
    instructionsShort: (min: number) =>
      `Posologie : ${min} caractère(s) minimum.`,
    instructionsLong: (max: number) => `Posologie : ${max} caractères maximum.`,
  },
};
