/** Composants partagés (src/ui) : badges, conversation, compteurs. */
export const ui = {
  status: {
    normal: "Normal",
    watch: "À surveiller",
    urgent: "Urgent",
    paused: "En pause",
    "consent-pending": "Accord en attente",
    "consent-given": "Accord donné",
    "consent-stopped": "STOP reçu",
  },
  assistants: {
    numaRole: "Échange avec les propriétaires sur WhatsApp",
    stiveRole: "Aide l'équipe du cabinet dans Stivea",
    avatarAlt: (name: string, aiLabel: string) =>
      `${name}, ${aiLabel.toLowerCase()}`,
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
  chat: {
    conversation: "Conversation WhatsApp",
    numaAuthor: "Numa · assistante IA",
    vetAuthor: (name: string | null) =>
      `${name ?? "Vétérinaire"} · via WhatsApp du cabinet`,
    owner: "Propriétaire",
    theOwner: "le propriétaire",
    photoAlt: (owner: string) => `Photo envoyée par ${owner}`,
    fictitious: (label: string) => `${label} (fictive)`,
    observations: "Observations de l'IA, à vérifier (aucun diagnostic)",
    voice: (duration: string) => `Message vocal · ${duration}`,
    voiceLabel: (owner: string) => `Message vocal de ${owner}`,
    transcript: "Transcription : ",
    transcribing: "en cours…",
    quote: (text: string) => `« ${text} »`,
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
};
