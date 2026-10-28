import type { SharedDictionary } from "../types";

export const shared: SharedDictionary = {
  status: {
    normal: "Nothing flagged",
    watch: "To watch",
    urgent: "Urgent",
    paused: "Paused",
    "consent-pending": "Consent pending",
    "consent-given": "Consent given",
    "consent-stopped": "STOP received",
  },
  assistants: {
    numaRole: "Talks with owners on WhatsApp",
    stiveRole: "The vet's assistant: it prepares, you decide",
    numaAi: "AI assistant",
    stiveAi: "AI assistant",
    avatarAlt: (name, aiLabel) => `${name}, ${aiLabel}`,
  },
  chat: {
    conversation: "WhatsApp conversation",
    numaAuthor: "Numa · AI assistant",
    vetAuthor: (name) => `${name ?? "Vet"} · via the practice's WhatsApp`,
    owner: "Owner",
    theOwner: "the owner",
    photoAlt: (owner) => `Photo sent by ${owner}`,
    fictitious: (label) => `${label} (fictitious)`,
    observations: "AI observations, to be checked (no diagnosis)",
    voice: (duration) => `Voice note · ${duration}`,
    voiceLabel: (owner) => `Voice note from ${owner}`,
    transcript: "Transcript: ",
    transcribing: "in progress…",
    quote: (text) => `“${text}”`,
  },
};
