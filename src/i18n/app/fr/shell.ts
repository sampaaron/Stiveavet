/** Cadre de l'espace cabinet : navigation, compte, bandeaux communs. */
export const shell = {
  skipToContent: "Aller au contenu",
  openMenu: "Ouvrir le menu",
  closeMenu: "Fermer le menu",
  mainNavigation: "Navigation principale",
  lock: "Verrouiller",
  account: "Mon compte",
  /** Logo Stivea Vet : il ramène au site public. */
  backToSite: "Retour au site Stivea Vet",
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
  /** Onglets de la rubrique ouverte, en tête de page. */
  sectionTabs: (section: string) => `Onglets de la rubrique ${section}`,
  onThisPage: "Sur cette page",
  nav: {
    home: "Accueil",
    overview: "Vue d'ensemble",
    followupSection: "Suivi",
    assistants: "Assistants IA",
    shortcuts: "Raccourcis",
    documents: "Documents",
    contents: "Contenus",
    settings: "Réglages",
    integrations: "Intégrations",
    tasks: "Automatisations",
    followups: "Suivis",
    patients: "Animaux",
    alerts: "Alertes",
    agenda: "Agenda",
    stive: "Stive",
    practice: "Cabinet",
    protocols: "Protocoles",
    team: "Équipe et droits",
    billing: "Facturation",
    journal: "Journal d'activité",
    help: "Centre d'aide",
    onboarding: "Démarrage guidé",
  },
};
