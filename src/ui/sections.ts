/**
 * Identité de chaque rubrique de l'espace cabinet (ADR 0033) : une teinte d'accent et un
 * motif décoratif, pour que chaque écran ait son caractère. Décor seulement : aucune
 * information n'est portée par la teinte, et les niveaux de gravité gardent leurs couleurs.
 */
export type Section =
  | "today"
  | "followups"
  | "patients"
  | "alerts"
  | "agenda"
  | "assistants"
  | "protocols"
  | "team"
  | "billing"
  | "tasks"
  | "journal"
  | "help"
  | "onboarding";

const prefixes: readonly [string, Section][] = [
  ["/app/suivis", "followups"],
  ["/app/animaux", "patients"],
  ["/app/alertes", "alerts"],
  ["/app/agenda", "agenda"],
  ["/app/reglages", "assistants"],
  ["/app/stive", "assistants"],
  ["/app/protocoles", "protocols"],
  ["/app/equipe", "team"],
  ["/app/facturation", "billing"],
  ["/app/taches", "tasks"],
  ["/app/journal", "journal"],
  ["/app/aide", "help"],
  ["/app/demarrage", "onboarding"],
];

/** Rubrique d'une adresse de l'espace cabinet ; « Aujourd'hui » par défaut. */
export function sectionOf(pathname: string): Section {
  for (const [prefix, section] of prefixes) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`))
      return section;
  }
  return "today";
}

/**
 * Teinte d'accent de chaque rubrique, choisie pour un contraste d'au moins 4,5:1 sur blanc
 * (texte de l'en-tête), et sa lueur claire pour le fond décoratif.
 */
export const sectionAccents: Record<Section, { accent: string; glow: string }> =
  {
    today: { accent: "#087a54", glow: "#f5c46b" },
    followups: { accent: "#0b7480", glow: "#7fe3d6" },
    patients: { accent: "#6a4dd3", glow: "#c9b8ff" },
    alerts: { accent: "#b8432d", glow: "#ffb39e" },
    agenda: { accent: "#3557cf", glow: "#a9c1ff" },
    assistants: { accent: "#5b4fe0", glow: "#8ce8c3" },
    protocols: { accent: "#56743f", glow: "#d6e6a8" },
    team: { accent: "#0f766e", glow: "#9ee7da" },
    billing: { accent: "#8a5f12", glow: "#f3d27a" },
    tasks: { accent: "#475569", glow: "#cbd5e1" },
    journal: { accent: "#475569", glow: "#c7d2fe" },
    help: { accent: "#087a54", glow: "#bfe9d6" },
    onboarding: { accent: "#087a54", glow: "#8ce8c3" },
  };
