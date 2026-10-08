/** Mots et phrases partagés par tous les écrans de l'espace cabinet. */
export const common = {
  invalidRequest: "Demande invalide. Rechargez la page.",
  save: "Enregistrer",
  cancel: "Annuler",
  confirm: "Confirmer",
  close: "Fermer",
  edit: "Modifier",
  remove: "Retirer",
  back: "Retour",
  loading: "Chargement…",
  saved: "Enregistré.",
  yes: "Oui",
  no: "Non",
  none: "Aucun",
  optional: "facultatif",
  simulated: "simulé",
  numaAi: "Assistante IA",
  stiveAi: "Assistant IA",
  and: "et",
  /** Liste lisible : « Antoine », « Antoine et Chloé », « A, B et C ». */
  list: (items: readonly string[]) =>
    items.length <= 1
      ? (items[0] ?? "")
      : `${items.slice(0, -1).join(", ")} et ${items.at(-1)}`,
  language: {
    label: "Langue de l'interface :",
    switchTo: "English",
  },
};
