/** Textes de cette partie de l'espace cabinet (voir ADR 0022). */
export const alerts = {
  title: "Alertes",
  description:
    "Messages de propriétaires classés urgents ou à surveiller par les règles du triage. Numa ne pose aucun diagnostic : chaque alerte attend la décision d'un vétérinaire.",
  done: {
    recue: "Réception confirmée : l'escalade est annulée.",
    close: "Alerte close.",
  },
  empty: {
    section: "Aucune alerte en cours",
    title: "Rien à traiter",
    description:
      "Les urgences et les signes à surveiller signalés par les propriétaires apparaîtront ici.",
  },
  groups: { urgent: "Urgences", watch: "À surveiller" },
  /** Rappel global : un simple décompte, sans contenu clinique. */
  notice: {
    pending: (urgent: number, watch: number) => {
      const parts = [
        urgent ? `${urgent} urgence${urgent > 1 ? "s" : ""}` : null,
        watch ? `${watch} alerte${watch > 1 ? "s" : ""} à surveiller` : null,
      ].filter((part): part is string => part !== null);
      return `${parts.join(" et ")} sans accusé de réception.`;
    },
    view: "Voir les alertes",
  },
  card: {
    urgentPending: (time: string) =>
      `Urgence signalée à ${time}, sans accusé de réception`,
    urgent: (time: string) => `Urgence signalée à ${time}`,
    watch: (time: string) => `À surveiller depuis ${time}`,
    openFile: (animalName: string) => `Ouvrir le dossier de ${animalName}`,
  },
  status: {
    openEscalating: (target: string, time: string) =>
      `Prévenu : ${target}. Sans accusé de réception, toute l'équipe vétérinaire sera alertée à ${time}.`,
    open: (target: string) => `Prévenu : ${target}.`,
    escalated: (time: string | null) =>
      `Sans accusé de réception, toute l'équipe vétérinaire a été alertée${time ? ` à ${time}` : ""}.`,
    acknowledged: (by: string | null, time: string | null) =>
      `Réception confirmée par ${by ?? "un vétérinaire"}${time ? ` à ${time}` : ""}. L'escalade est annulée.`,
    resolved: "Alerte close.",
  },
  buttons: {
    acknowledge: "Accuser réception",
    resolve: "Clore l'alerte",
  },
  /** Numéro WhatsApp professionnel où le vétérinaire reçoit les urgences (ADR 0024). */
  phone: {
    title: "Mon numéro pour les alertes urgentes",
    description:
      "Numéro WhatsApp professionnel où Stivea Vet vous prévient d'une urgence, sans aucun détail médical. Il n'est utilisé que pour ces alertes.",
    current: (masked: string) => `Numéro enregistré : ${masked}.`,
    none: "Aucun numéro : les urgences n'apparaissent que dans Stivea Vet.",
    label: "Numéro WhatsApp",
    hint: "Par exemple 06 12 34 56 78, ou +32… pour un numéro étranger. Laissez vide pour le retirer.",
    submit: "Enregistrer le numéro",
    saved: "Numéro d'alerte enregistré.",
    invalid: "Numéro invalide : indiquez un numéro mobile complet.",
  },
};
