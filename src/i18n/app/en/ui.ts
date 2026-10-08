import type { AppDictionary } from "../types";

export const ui: AppDictionary["ui"] = {
  status: {
    normal: "Normal",
    watch: "To watch",
    urgent: "Urgent",
    paused: "Paused",
    "consent-pending": "Consent pending",
    "consent-given": "Consent given",
    "consent-stopped": "STOP received",
  },
  assistants: {
    numaRole: "Talks with owners on WhatsApp",
    stiveRole: "Helps the practice team in Stivea",
    avatarAlt: (name, aiLabel) => `${name}, ${aiLabel}`,
  },
  capacity: {
    label: "Active follow-ups",
    valueText: (used, included) =>
      `${used} active follow-ups out of ${included} included`,
    remaining: (count) =>
      count === 1 ? "1 included place left" : `${count} included places left`,
    full: (price) =>
      `Included places used: each new follow-up is billed ${price} excl. VAT`,
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
  agendaEvent: {
    kinds: {
      consultation: "Consultation",
      chirurgie: "Surgery",
      controle: "Check-up",
      urgence: "Emergency",
    },
    pending: "To confirm",
  },
};
