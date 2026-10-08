/** Textes de cette partie de l'espace cabinet (voir ADR 0022). */
export const agenda = {
  title: "Agenda",
  description:
    "Créneaux libres que Numa pourra proposer aux propriétaires. Chaque rendez-vous reste confirmé par le cabinet.",
  /** Confirmations affichées après une action (`?fait=…`). */
  done: {
    capture: (count: number) =>
      count <= 1
        ? `Capture lue : ${count} créneau libre enregistré. Le fichier a été supprimé.`
        : `Capture lue : ${count} créneaux libres enregistrés. Le fichier a été supprimé.`,
    retire: "Créneau retiré.",
    confirme: "Rendez-vous confirmé. Numa prévient le propriétaire.",
    refuse:
      "Créneau refusé. Numa prévient le propriétaire que le cabinet le recontactera.",
    rappele: "Demande marquée comme rappelée.",
  },
  slots: {
    title: "Créneaux libres à venir",
    description:
      "Lus sur les captures d'agenda. Lecture simulée dans cette version.",
    emptyTitle: "Aucun créneau libre enregistré",
    emptyDescription:
      "Envoyez une capture d'écran de l'agenda : ses créneaux libres apparaîtront ici.",
    dayListLabel: (day: string) => `Créneaux libres du ${day}`,
    removeLabel: (day: string, start: string, end: string, vet: string) =>
      `Retirer le créneau du ${day}, ${start} à ${end}, ${vet}`,
  },
  capture: {
    title: "Envoyer une capture d'agenda",
    description: "En attendant la connexion directe à l'agenda (dr.veto).",
    beforeTitle: "Avant d'envoyer",
    beforeText:
      "Masquez les noms, motifs et toute information inutile : ne laissez visibles que les créneaux libres. La capture est supprimée dès la lecture des créneaux.",
    vetLabel: "Agenda de",
    fileLabel: "Capture d'écran de l'agenda",
    fileHint: "JPEG, PNG ou WebP, 5 Mo au plus.",
    submit: "Lire les créneaux libres",
  },
  recentCaptures: {
    title: "Dernières captures",
    description:
      "Aucune capture n'est gardée : seule la trace de sa suppression reste.",
    received: (when: string) => `Reçue le ${when}`,
    deleted: (when: string) => `, supprimée le ${when}`,
    deleting: ", suppression en cours",
  },
  pending: {
    title: "Rendez-vous à confirmer",
    descriptionCanConfirm:
      "Créneaux choisis par les propriétaires parmi ceux proposés par Numa. Numa leur annonce votre décision.",
    descriptionReadOnly:
      "Créneaux choisis par les propriétaires. Un vétérinaire, ou un assistant autorisé par l'administrateur, les confirme.",
    empty: "Aucun rendez-vous en attente.",
    withVet: (vet: string) => `avec ${vet}`,
    confirm: "Confirmer",
    decline: "Refuser",
    confirmLabel: (animal: string, when: string) =>
      `Confirmer le rendez-vous de ${animal}, ${when}`,
    declineLabel: (animal: string, when: string) =>
      `Refuser le rendez-vous de ${animal}, ${when}`,
  },
  callbacks: {
    title: "Demandes à rappeler",
    description:
      "Numa n'avait pas de créneau adapté avec le vétérinaire responsable : elle a annoncé que le cabinet rappellerait.",
    empty: "Aucune demande à rappeler.",
    requested: (when: string) => `Demandé le ${when}`,
    done: "Rappelé",
    doneLabel: (animal: string, when: string) =>
      `Marquer comme rappelé : ${animal}, demande du ${when}`,
  },
  validation: {
    vet: "Choisissez le vétérinaire concerné.",
    file: "Choisissez une capture d'écran.",
    tooLarge: "Capture trop lourde : 5 Mo au plus.",
  },
};
