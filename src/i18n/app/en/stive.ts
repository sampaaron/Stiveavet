import type { AppDictionary } from "../types";

export const stive: AppDictionary["stive"] = {
  title: "Stive",
  eyebrow: "Your AI assistant",
  description:
    "Talk with Stive about medicine, running the practice, communicating with owners and the animals you follow.",
  aiNotice:
    "Stive is an AI: its answers may be inaccurate. They replace neither your examination nor your clinical judgement, and the decision is always yours.",
  simulatedNotice:
    "Simulated mode (local machine): Stive answers with pre-written rules, without a real AI model.",
  talk: "Talk to Stive",
  newConversation: "New conversation",
  history: {
    title: "Your conversations",
    private: "Visible to you only.",
    empty: "No conversation yet.",
  },
  welcome: {
    title: (firstName: string) =>
      `Hello ${firstName}, what would you like to talk about?`,
    description:
      "Mention a followed animal by its name, or pick its file: Stive then relies on what you are allowed to read in it.",
    suggestionsLabel: "To get started",
    suggestions: [
      "Give me an update on the follow-ups that need my attention.",
      "Help me write a reassuring but careful message for a worried owner after a spay.",
      "Which signs should bring a dog back urgently after orthopaedic surgery?",
      "How can I better organise this week's post-operative check-ups?",
    ],
  },
  composer: {
    label: "Your message to Stive",
    placeholder: "Ask a question, mention a followed animal…",
    hint: "Enter to send, Shift + Enter for a new line.",
    send: "Send",
  },
  followup: {
    label: "Practice file",
    auto: "Automatic detection (animal's name)",
    none: "No file",
    option: (animal: string, detail: string) => `${animal} · ${detail}`,
    help: "Stive only reads the files you have access to, and never sends an owner's name, number or e-mail to the AI service.",
  },
  you: "You",
  thinking: "Stive is writing its answer…",
  basedOn: (animal: string) => `Based on ${animal}'s file`,
  basedOnOther: "Based on a practice file",
  ambiguous:
    "Several followed animals match your message: pick the right file in the list so Stive can rely on it.",
  errors: {
    empty: "Write your message to Stive.",
    tooLong: "Message too long: 2,000 characters at most.",
    rateLimited:
      "You have sent many messages in a short time: try again in a few minutes.",
    unavailable:
      "Stive cannot answer right now. Your message was not sent: try again in a moment.",
  },
  remove: {
    button: "Delete this conversation",
    confirm: "Permanently delete this conversation? This cannot be undone.",
    done: "Conversation deleted.",
  },
};
