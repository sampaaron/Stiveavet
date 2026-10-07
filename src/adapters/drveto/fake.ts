import type { DrVetoConnector } from "./types";

/** Simulation : aucun appel réseau ; le code du cabinet n'est jamais conservé en clair. */
export const fakeDrVeto: DrVetoConnector = {
  simulated: true,
  async connectPractice(practiceCode) {
    return {
      displayLabel: `Cabinet ${practiceCode.slice(0, 2).toUpperCase()}••• (simulé)`,
    };
  },
};
