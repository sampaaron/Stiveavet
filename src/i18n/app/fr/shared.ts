/**
 * Textes des composants partagés que la vitrine affiche aussi (badges, assistants, fil). Les
 * composants clients les chargent seuls (`useSharedText`) : la vitrine n'embarque pas tout le
 * dictionnaire de l'espace cabinet. Ils restent accessibles dans `ui`.
 */
export const shared = {
  status: {
    normal: "Rien à signaler",
    watch: "À surveiller",
    urgent: "Urgent",
    paused: "En pause",
    "consent-pending": "Accord en attente",
    "consent-given": "Accord donné",
    "consent-stopped": "STOP reçu",
  },
  assistants: {
    numaRole: "Échange avec les propriétaires sur WhatsApp",
    stiveRole: "L'assistant du vétérinaire : il prépare, vous décidez",
    numaAi: "Assistante IA",
    stiveAi: "Assistant IA",
    avatarAlt: (name: string, aiLabel: string) =>
      `${name}, ${aiLabel.toLowerCase()}`,
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
};
