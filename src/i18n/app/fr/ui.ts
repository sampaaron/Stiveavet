import { shared } from "./shared";

/** Composants partagés (src/ui) : badges, conversation, compteurs. */
export const ui = {
  ...shared,
  colorMode: {
    title: "Affichage",
    description:
      "Ce choix ne change que votre écran : chaque membre de l'équipe choisit le sien.",
    legend: "Mode",
    options: { light: "Clair", dark: "Sombre", system: "Automatique" },
    hints: {
      light: "Fond clair, comme aujourd'hui.",
      dark: "Fond noir, plus doux le soir et au bloc.",
      system: "Suit le réglage de l'ordinateur ou du téléphone.",
    },
  },
  capacity: {
    label: "Suivis actifs",
    valueText: (used: number, included: number) =>
      `${used} suivis actifs sur ${included} inclus`,
    remaining: (count: number) =>
      count === 1
        ? "1 place incluse restante"
        : `${count} places incluses restantes`,
    full: (price: string) =>
      `Places incluses utilisées : chaque nouveau suivi est facturé ${price} HT`,
  },
  agendaEvent: {
    kinds: {
      consultation: "Consultation",
      chirurgie: "Chirurgie",
      controle: "Contrôle",
      urgence: "Urgence",
    },
    pending: "À confirmer",
  },
  fileDrop: {
    prompt: "Glissez l'image ici",
    browse: "ou cliquez pour choisir un fichier",
    replace: "Cliquez pour choisir une autre image",
    document: {
      prompt: "Glissez le fichier ici",
      replace: "Cliquez pour choisir un autre fichier",
    },
  },
};
