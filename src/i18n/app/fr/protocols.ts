/** Textes de cette partie de l'espace cabinet (voir ADR 0022). */
export const protocols = {
  title: "Protocoles",
  description:
    "Chaque modification crée une nouvelle version : un suivi déjà lancé garde toujours la sienne.",
  newProtocol: "Nouveau protocole",
  /** Liste des protocoles. */
  lists: {
    cabinet: "Protocoles du cabinet",
    cabinetEmpty: "Aucun protocole du cabinet pour l'instant.",
    mine: "Mes protocoles",
    mineDescription:
      "Visibles par vous seul, et par les personnes qui gèrent les protocoles du cabinet.",
    mineEmpty:
      "Vous n'avez pas encore de protocole personnel. Dupliquez un protocole du cabinet pour l'adapter.",
    colleagues: "Protocoles personnels des confrères",
    archived: "Archivés",
    version: (versionNumber: number) => `version ${versionNumber}`,
    owner: (name: string) => `de ${name}`,
    followups: (count: number) => `${count} suivi(s)`,
  },
  /** Bibliothèque de départ : son contenu clinique reste rédigé en français. */
  library: {
    title: "Bibliothèque de départ",
    notice:
      "Contenu fictif de démonstration, à valider par un vétérinaire avant tout usage.",
    install: "Ajouter au cabinet",
    installLabel: (name: string) => `Ajouter « ${name} » au cabinet`,
    installed: "Modèle ajouté. Il reste à valider par un vétérinaire.",
  },
  validationBadge: {
    validated: "Validé",
    toValidate: "À valider par un vétérinaire",
  },
  /** Fiche d'un protocole. */
  detail: {
    metaTitle: "Protocole",
    archived: "Archivé",
    days: (count: number) => `${count} jours`,
    version: (versionNumber: number) => `version ${versionNumber}`,
    personal: (name: string) => `protocole personnel de ${name}`,
    cabinet: "protocole du cabinet",
    readOnly: (versionNumber: number) =>
      `Version ${versionNumber}, en lecture seule`,
    seeCurrent: "Voir la version actuelle",
    readOnlyBody:
      "Les suivis lancés avec cette version la gardent telle quelle.",
    description: "Description",
    steps: "Étapes",
    stepsDescription:
      "Numa pose ces questions et envoie ces messages ; elle ne prend aucune décision médicale.",
    alerts: "Signes d'alerte",
    alertsDescription: "En cas de doute, Numa escalade vers le vétérinaire.",
    /** Délai d'une étape : « 4 h après », « J+1 », « J+10, 4 h ». */
    offsetHours: (hours: number) => `${hours} h après`,
    offsetDays: (days: number) => `J+${days}`,
    offsetDaysHours: (days: number, hours: number) => `J+${days}, ${hours} h`,
  },
  actions: {
    title: "Actions",
    duplicatePersonal: "Dupliquer dans mes protocoles",
    duplicateCabinet: "Dupliquer pour le cabinet",
    validateIntro:
      "En validant, vous confirmez avoir relu les étapes et les signes d'alerte de cette version.",
    validate: "Valider ce protocole",
    validated: "Protocole validé.",
    archive: "Archiver le protocole",
    restore: "Restaurer le protocole",
    archivedNotice: "Protocole archivé.",
    restoredNotice: "Protocole restauré.",
  },
  versions: {
    title: "Historique des versions",
    description: "Une version enregistrée ne change plus jamais.",
    version: (versionNumber: number) => `Version ${versionNumber}`,
    validatedBy: (name: string) => `Validée par ${name}`,
    notValidated: "Non validée",
    followups: (count: number) => ` · ${count} suivi(s) lancé(s) avec elle`,
    removedMember: "Membre retiré",
    /** Notes écrites par l'application (enregistrées telles quelles en base). */
    systemNotes: {
      creation: "Création",
      copy: "Copie",
      library: "Ajouté depuis la bibliothèque de départ",
    },
  },
  /** Création et modification. */
  editor: {
    newDescription:
      "Vous validez son contenu en l'enregistrant : étapes et signes d'alerte.",
    editMetaTitle: "Modifier un protocole",
    editTitle: "Modifier le protocole",
    editDescription: (nextVersion: number) =>
      `Enregistrer crée la version ${nextVersion}. Les suivis déjà lancés gardent la leur.`,
    scopeCabinet: "Le cabinet",
    scopePersonal: "Moi seul (protocole personnel)",
    descriptionSection: "Description",
    scope: "Protocole destiné à",
    name: "Nom du protocole",
    category: "Type",
    species: "Espèce",
    duration: "Durée du suivi (jours)",
    description: "Description",
    steps: "Étapes",
    stepsDescription:
      "Ce que Numa envoie ou demande, et quand. Elles seront rangées dans l'ordre chronologique.",
    alerts: "Signes d'alerte",
    alertsDescription:
      "Validés par le vétérinaire. Numa ne pose jamais de diagnostic : elle signale et, en cas de doute, escalade.",
    changeNote: "Ce qui change dans cette version",
    changeNoteHint:
      "Visible dans l'historique. Les suivis déjà lancés gardent leur version.",
    saveVersion: "Enregistrer une nouvelle version",
    create: "Créer le protocole",
  },
  /** Éditeurs d'étapes et de signes d'alerte (protocole et fiche de lancement d'un suivi). */
  planEditor: {
    due: (date: string) => `Prévue le ${date}`,
    pastStep: (kind: string) => `Étape passée · ${kind}`,
    step: (number: number) => `Étape ${number}`,
    removeStep: (number: number) => `Retirer l'étape ${number}`,
    delay: "Délai",
    unit: "Unité",
    hoursAfter: "heures après",
    daysAfter: "jours après",
    stepKind: "Type d'étape",
    stepContent: (number: number) => `Contenu de l'étape ${number}`,
    addStep: "Ajouter une étape",
    level: "Niveau",
    alert: (number: number) => `Signe d'alerte ${number}`,
    removeAlert: (number: number) => `Retirer le signe d'alerte ${number}`,
    addAlert: "Ajouter un signe d'alerte",
  },
  /** Refus de validation du contenu : codes du schéma (domains/protocoles/content.ts). */
  validation: {
    name_short: "Nom : 2 caractères minimum.",
    name_long: "Nom : 120 caractères maximum.",
    description_long: "Description : 2000 caractères maximum.",
    duration_integer: "Durée en jours entiers.",
    duration_min: "Durée d'au moins 1 jour.",
    duration_max: "Durée de 90 jours maximum.",
    steps_min: "Ajoutez au moins une étape.",
    steps_max: "30 étapes maximum.",
    alerts_min: "Ajoutez au moins un signe d'alerte.",
    alerts_max: "20 signes d'alerte maximum.",
    step_offset_integer: "Délai en heures entières.",
    step_offset_negative: "Le délai ne peut pas être négatif.",
    step_offset_max: "Délai de 90 jours maximum.",
    step_content_short: "Étape : 2 caractères minimum.",
    step_content_long: "Étape : 1000 caractères maximum.",
    alert_description_short: "Signe d'alerte : 2 caractères minimum.",
    alert_description_long: "Signe d'alerte : 300 caractères maximum.",
    step_after_end: "Une étape tombe après la fin du suivi.",
    change_note_long: "Note de version : 500 caractères maximum.",
  },
  /** Refus de validation sans code connu (message par défaut de Zod). */
  invalidContent: "Vérifiez le contenu du protocole, puis enregistrez.",
};
