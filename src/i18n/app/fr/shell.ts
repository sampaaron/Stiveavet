/** Cadre de l'espace cabinet : navigation, compte, bandeaux communs. */
export const shell = {
  skipToContent: "Aller au contenu",
  openMenu: "Ouvrir le menu",
  closeMenu: "Fermer le menu",
  mainNavigation: "Navigation principale",
  lock: "Verrouiller",
  logout: "Déconnexion",
  newFollowup: "Nouveau suivi",
  search: {
    label: "Rechercher un suivi",
    placeholder: "Animal, propriétaire, intervention…",
    shortcut: "Appuyez sur / pour rechercher",
  },
  /** Cloche des alertes : un simple décompte, sans contenu clinique. */
  alertsNone: "Alertes : aucune en attente",
  alertsPending: (count: number) =>
    `Alertes : ${count} sans accusé de réception`,
  onThisPage: "Sur cette page",
  nav: {
    today: "Aujourd'hui",
    followups: "Suivis",
    patients: "Animaux",
    alerts: "Alertes",
    agenda: "Agenda",
    stive: "Stive",
    practice: "Cabinet",
    assistants: "Assistants IA",
    protocols: "Protocoles",
    settings: "Numa, urgences et garde",
    team: "Équipe et droits",
    billing: "Facturation",
    tasks: "Tâches en échec",
    journal: "Journal d'activité",
    help: "Centre d'aide",
    onboarding: "Démarrage guidé",
  },
};
