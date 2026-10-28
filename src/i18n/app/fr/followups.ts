import { nombre } from "@/i18n/pluriel";

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
    filters: {
      label: "Filtrer les suivis",
      search: "Rechercher",
      placeholder: "Animal, propriétaire ou vétérinaire",
      placeholderClinical: "Animal, propriétaire, vétérinaire ou intervention",
      status: "Statut",
      statusAll: "Tous",
      statusOngoing: "En cours, en pause ou repris",
      priority: "Priorité",
      priorityAll: "Toutes",
      apply: "Filtrer",
      reset: "Effacer",
      noMatchTitle: "Aucun suivi ne correspond",
      noMatchDescription: "Modifiez la recherche ou les filtres.",
    },
  },
  /** Suivi test de l'installation. */
  testMark: "Suivi test",
  /** Recherche dr.veto avant la fiche de lancement. */
  create: {
    title: "Lancer un suivi",
    back: "Suivis",
    description:
      "Cherchez l'animal dans le registre du cabinet ou dans dr.veto, ou enregistrez-le. Vous relisez ensuite la fiche de lancement préparée par Stivea Vet.",
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
    registryTitle: "Dans le registre du cabinet",
    registryEmpty:
      "Aucun animal du registre ne correspond. Enregistrez-le s'il est nouveau.",
    launchFromRegistry: "Lancer",
    newAnimal: "Nouvel animal",
    newAnimalTitle: "Un nouveau patient ?",
    newAnimalBody:
      "Enregistrez son identité et le numéro WhatsApp de son propriétaire, puis lancez le suivi depuis sa fiche.",
    draftsTitle: "Fiches en préparation",
    draftsEmpty: "Aucune fiche en attente de lancement.",
    drvetoTitle: "Dans dr.veto",
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
    validateAllImported: (count: number) =>
      count > 1
        ? `Valider les ${count} traitements importés`
        : "Valider le traitement importé",
    optInGiven: (count: number) =>
      count > 1
        ? "Accord WhatsApp des propriétaires déjà noté au cabinet."
        : "Accord WhatsApp du propriétaire déjà noté au cabinet.",
    optInQrTitle: "Le plus simple : le QR code",
    optInQrBody:
      "Montrez-le au propriétaire : il le scanne avec son téléphone, envoie le message prêt, et son accord est noté tout seul. Plus rien à cocher.",
    optInQr: "Afficher le QR code au propriétaire",
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
  /** Accord WhatsApp par QR code à l'accueil (ADR 0051) : écran montré au propriétaire. */
  optInQr: {
    title: "QR code d'accord",
    back: (name: string) => `Fiche de lancement de ${name}`,
    heading: (name: string) => `Accord WhatsApp pour le suivi de ${name}`,
    intro:
      "À montrer au propriétaire, à l'accueil. Il scanne le QR code avec l'appareil photo de son téléphone : WhatsApp s'ouvre avec un message prêt, qu'il n'a plus qu'à envoyer.",
    consentTitle: "Ce que vous acceptez",
    consent: (practice: string, animal: string) =>
      `En envoyant ce message, vous acceptez que ${practice} vous écrive sur WhatsApp pour le suivi de ${animal}. Numa, l'assistante IA du cabinet, vous posera des questions sur son rétablissement et l'équipe vétérinaire lit vos réponses. Numa ne remplace pas le vétérinaire. Vous pouvez tout arrêter à tout moment en écrivant STOP.`,
    twoOwners:
      "Chaque propriétaire scanne son propre QR code, depuis son téléphone.",
    roles: { primary: "Propriétaire", secondary: "Second propriétaire" },
    fromPhone: (phone: string) => `À envoyer depuis le ${phone}`,
    qrAlt: (name: string) => `QR code d'accord WhatsApp pour ${name}`,
    code: (code: string) => `Code ${code}`,
    validUntil: (time: string) => `Valable jusqu'à ${time}`,
    preparing: "Préparation du QR code…",
    waiting: "En attente du message",
    expired: "Ce QR code a expiré.",
    renew: "Nouveau QR code",
    received: "Accord reçu",
    allReceived: (count: number) =>
      count > 1
        ? "Accord des deux propriétaires reçu : le suivi peut être lancé."
        : "Accord reçu : le suivi peut être lancé.",
    toSheet: "Ouvrir la fiche de lancement",
    toDashboard: "Revenir à la vue d'ensemble",
    simulatedTitle: "WhatsApp est simulé",
    simulatedBody:
      "Ce QR code ne contient que le texte du message : il n'ouvre aucune conversation. Le bouton imite l'envoi depuis le téléphone du propriétaire.",
    simulate: "Simuler l'envoi depuis le téléphone",
    simulateFor: (name: string) => ` de ${name}`,
    notReceived:
      "Le message n'a pas été pris en compte : affichez un nouveau QR code.",
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
      `Traitement : ${nombre(min, "caractère", "caractères")} minimum.`,
    treatmentLong: (max: number) => `Traitement : ${max} caractères maximum.`,
    instructionsShort: (min: number) =>
      `Posologie : ${nombre(min, "caractère", "caractères")} minimum.`,
    instructionsLong: (max: number) => `Posologie : ${max} caractères maximum.`,
  },
};
