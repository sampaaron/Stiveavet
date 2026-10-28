import type { AppDictionary } from "../types";

/** Pages added by the menu redesign (ADR 0044): assistants, shortcuts, integrations, contents. */
export const hub: AppDictionary["hub"] = {
  assistants: {
    title: "AI assistants",
    description:
      "The practice's two AI assistants: who each one talks to, what it does and what it never does.",
    numa: {
      talksTo: "Talks to owners, within follow-ups",
      doesTitle: "What she does",
      does: [
        "Sends the protocol's messages, within your sending hours.",
        "Collects replies, photos and voice messages.",
        "Alerts the team as soon as a reply is worrying.",
      ],
      neverTitle: "What she never does",
      never: [
        "Make a diagnosis or recommend a treatment.",
        "Pretend to be a person.",
      ],
      settings: "Set up Numa",
      followups: "See follow-ups",
    },
    stive: {
      talksTo: "Helps the practice team",
      doesTitle: "What he does",
      does: [
        "Prepares the daily briefing and summarises a file.",
        "Drafts messages, which you review.",
        "Finds your free slots and the appointments to confirm.",
      ],
      neverTitle: "What he never does",
      never: [
        "Send or change anything without your click.",
        "Give a diagnosis or a dosage.",
      ],
      usageLabel: "Your requests this month",
      usage: (used: number, limit: number) => `${used} of ${limit}`,
      open: "Talk to Stive",
      notIncluded: "Stive is not enabled for your account.",
      seeOffer: "Discover Stive",
    },
  },
  shortcuts: {
    title: "Shortcuts",
    description:
      "Ready-made requests for Stive, in one click. His answer opens in your conversation; nothing is sent without your approval.",
    run: "Ask Stive",
    runLabel: (title: string) => `Ask Stive: ${title}`,
    groups: {
      day: "My day",
      agenda: "Calendar",
      files: "Files and messages",
    },
    items: {
      briefing: {
        title: "My briefing for today",
        text: "What needs a decision today.",
        question: "My briefing for today",
      },
      appointments: {
        title: "Appointments to confirm",
        text: "Owners' appointment requests.",
        question: "Appointment requests to confirm",
      },
      slots: {
        title: "My free slots tomorrow",
        text: "To fit in a check-up.",
        question: "My free slots tomorrow",
      },
      teamSlots: {
        title: "The team's slots",
        text: "Each vet's free slots this week.",
        question: "Free slots for the whole team this week",
      },
      summary: {
        title: "Summarise a file",
        text: "Stive asks you which one, then summarises it.",
        question: "Summary of a file",
      },
      news: {
        title: "Check in on a patient",
        text: "A draft message for an owner.",
        question: "Draft a message to check in",
      },
      photo: {
        title: "Ask for a photo",
        text: "A draft to get a recent photo of the animal.",
        question: "Draft a message asking for a photo",
      },
      call: {
        title: "Ask them to call the practice",
        text: "A draft inviting the owner to call.",
        question: "Draft a message asking them to call the practice",
      },
    },
    notIncluded:
      "Shortcuts need Stive, which is not included in the practice's plan.",
  },
  integrations: {
    title: "Integrations",
    description:
      "The services connected to Stivea Vet and their status. Until the practice's accounts are open, connections run in simulation.",
    ai: {
      title: "AI assistants",
      description:
        "The provider that powers Numa and Stive, with no training on your data.",
      simulated: "Pre-written replies: no text leaves Stivea Vet.",
      connected: (provider: string) => `Connected: ${provider}.`,
      providers: { scaleway: "Scaleway (Paris)", mistral: "Mistral AI" },
    },
  },
  contents: {
    title: "Contents",
    description:
      "The drafts Stive wrote for you over the last 30 days. They only go out once reviewed and sent from the file.",
    draftTitle: (recipients: string, animal: string) =>
      `Message to ${recipients}, about ${animal}`,
    status: {
      open: "To review",
      done: "Used",
      expired: "Expired",
    },
    use: "Open in the file",
    createdAt: (when: string) => `Written ${when}`,
    empty: {
      title: "No drafts yet",
      description: "Ask Stive for a message to an owner: it will appear here.",
      action: "See shortcuts",
    },
    privacy:
      "Only you can see your drafts; they are deleted with your conversation after 30 days.",
  },
};
