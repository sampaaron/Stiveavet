import type { AppDictionary } from "../types";

export const shell: AppDictionary["shell"] = {
  skipToContent: "Skip to content",
  openMenu: "Open menu",
  closeMenu: "Close menu",
  mainNavigation: "Main navigation",
  lock: "Lock",
  account: "My account",
  /** Stivea Vet logo: it leads back to the public website. */
  backToSite: "Back to the Stivea Vet website",
  logout: "Sign out",
  newFollowup: "New follow-up",
  search: {
    label: "Search follow-ups",
    placeholder: "Animal, owner, procedure…",
    shortcut: "Press / to search",
  },
  /** Cloche des alertes : un simple décompte, sans contenu clinique. */
  alertsNone: "Alerts: none pending",
  alertsPending: (count: number) => `Alerts: ${count} not acknowledged`,
  onThisPage: "On this page",
  nav: {
    today: "Today",
    followups: "Follow-ups",
    patients: "Animals",
    alerts: "Alerts",
    agenda: "Calendar",
    stive: "Stive",
    practice: "Practice",
    assistants: "AI assistants",
    protocols: "Protocols",
    settings: "Numa, emergencies and on-call",
    team: "Team and permissions",
    billing: "Billing",
    tasks: "Failed tasks",
    journal: "Activity log",
    help: "Help centre",
    onboarding: "Guided setup",
  },
};
