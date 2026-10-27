import type { AppDictionary } from "../types";

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/** Stive, the team's AI assistant (lot 29, ADR 0034). Always presented as an AI. */
export const stive: AppDictionary["stive"] = {
  title: "Stive",
  eyebrow: "AI assistants",
  description:
    "Stive prepares, you decide: nothing real happens without your confirmation.",
  aiNotice:
    "Stive is an AI. It never diagnoses, never gives a dosage and can be wrong: check its answers in the file.",
  thread: "Conversation with Stive",
  you: "You",
  greeting: (firstName: string) =>
    `Hello ${firstName}, what can I prepare for you?`,
  greetingHelp: "Ask in your own words, or pick a suggestion.",
  greetingHelpAi:
    "Talk to me as you would to a colleague: the job, your files, your clients, how the practice runs. I prepare, you decide.",
  mode: {
    simulatedTitle: "Simulated mode",
    simulated:
      "Here Stive only recognises six requests, through written rules. To talk freely about the job, the AI must be connected: AI_PROVIDER variable and AI_API_KEY key in the server's .env file, never in the code.",
  },
  thinking: "Stive is thinking…",
  ask: {
    label: "Your request to Stive",
    placeholder: "For example: my free slots tomorrow",
    placeholderAi:
      "For example: how do I tell a worried owner about a complication?",
    submit: "Ask",
    empty: "Write your request before sending it.",
    tooLong: "Your request is too long (500 characters at most).",
    suggestions: "Suggestions",
  },
  suggestions: {
    briefing: "My daily briefing",
    slots: "My free slots tomorrow",
    appointments: "Appointments to confirm",
    summary: (animal: string) => `Summary of ${animal}'s file`,
    draftNews: (animal: string) => `Draft a message to check in on ${animal}`,
    draftPhoto: (animal: string) =>
      `Draft a message asking for a photo of ${animal}`,
    pause: (animal: string) => `Pause ${animal}'s follow-up`,
    resume: (animal: string) => `Resume the follow-up of ${animal}`,
    stop: (animal: string) => `Stop ${animal}'s follow-up`,
  },
  dossierContext: {
    title: (animal: string) => `${animal}'s file`,
    description:
      "Stive answers about this file as long as you don't name another animal.",
    open: "Open the file",
  },
  capabilities: {
    title: "What Stive can do",
    items: [
      "Your daily briefing: emergencies, alerts, agenda and sheets to finish",
      "A file summary, with its signals and open questions",
      "A vet's free slots over a period",
      "Appointments requested by owners, to confirm",
      "A message draft, which you send yourself",
      "Pause, resume or stop a follow-up, after confirmation",
    ],
    conversation:
      "Talk about the job as with a colleague: post-operative follow-up, organisation, communicating with owners",
    conversationOff: "Talk freely about the job: needs the AI to be connected",
    limits:
      "It never diagnoses an animal, never gives a dose or a prescription (see the SPC or your formulary), and the decision is always yours.",
  },
  privacy: {
    title: "Your conversation",
    text: "Only you can see it, not even the practice administrator. It is deleted after 30 days.",
    usage: (used: number, limit: number) =>
      `This month: ${plural(used, "request", "requests")} out of ${limit}.`,
    clear: "Clear my conversation",
    cleared: "Your conversation with Stive was cleared.",
  },
  hidden:
    "This answer is no longer available: you no longer have access to this file.",
  openFile: "Open the file",
  briefing: {
    title: "Your daily briefing",
    calm: "Nothing urgent for now: no priority follow-up and no pending alert.",
    active: (count: number) =>
      `${plural(count, "ongoing follow-up", "ongoing follow-ups")} in your scope.`,
    urgent: "Emergencies",
    watch: "To watch",
    line: (procedure: string, day: number, vet: string) =>
      `${procedure} · Day ${day} · ${vet}`,
    unacknowledged: (count: number) =>
      `${plural(count, "alert", "alerts")} not acknowledged`,
    agenda: "Today's agenda",
    agendaEmpty: "No appointment today.",
    pending: "to confirm",
    pendingAppointments: (count: number) =>
      `${plural(count, "requested appointment", "requested appointments")} to confirm`,
    drafts: "Launch sheets to finish",
    draftLine: (vet: string) => `Responsible: ${vet}`,
    openAlerts: "See alerts",
    openAgenda: "See the agenda",
  },
  summary: {
    title: (animal: string) => `Summary of ${animal}'s file`,
    line: (procedure: string, day: number, status: string) =>
      `${procedure} · Day ${day} · ${status}`,
    notLaunched:
      "This follow-up hasn't started yet: there is nothing to summarise.",
    positives: "Reassuring signals",
    negatives: "Worrying signals",
    questions: "Open questions",
    exchanges: (messages: number, photos: number, voices: number) =>
      `${plural(messages, "owner message", "owner messages")}, ${plural(photos, "photo", "photos")}, ${plural(voices, "voice note", "voice notes")}`,
    openAlerts: (count: number) =>
      plural(count, "ongoing alert", "ongoing alerts"),
    withheld: (count: number) =>
      `${plural(count, "line", "lines")} withheld by the safeguards: read the conversation in the file.`,
  },
  slots: {
    title: "Free slots",
    periods: {
      today: "today",
      tomorrow: "tomorrow",
      day: "that day",
      this_week: "this week",
      next_week: "next week",
      next_days: "the next 7 days",
    },
    heading: (period: string, range: string) => `${period} (${range})`,
    ofVet: (vet: string) => `${vet}'s agenda`,
    ofTeam: "The whole team's agenda",
    empty: "No free slot over this period. Slots come from agenda screenshots.",
    source: "Read from agenda screenshots, until dr.veto is connected.",
    openAgenda: "Open the agenda",
  },
  appointments: {
    title: "Requested appointments",
    empty: "No appointment to confirm.",
    callbacks: (count: number) =>
      `${plural(count, "owner is", "owners are")} waiting for a call back, with no slot chosen.`,
    readOnly: "Only someone allowed to confirm appointments can decide.",
    line: (when: string, vet: string) => `${when} · ${vet}`,
    confirm: "Confirm",
    decline: "Decline",
    confirmLabel: (animal: string, when: string) =>
      `Confirm ${animal}'s appointment, ${when}`,
    declineLabel: (animal: string, when: string) =>
      `Decline ${animal}'s appointment, ${when}`,
    help: "Numa lets the owner know as soon as you decide.",
  },
  draft: {
    title: (recipients: string, animal: string) =>
      `Draft for ${recipients} (${animal})`,
    use: "Open in the conversation",
    help: "The text will be placed in the file's message box. Nothing is sent until you click Send.",
  },
  status: {
    question: {
      pause: (animal: string) => `Pause ${animal}'s follow-up?`,
      resume: (animal: string) => `Resume ${animal}'s follow-up?`,
      stop: (animal: string) => `Stop ${animal}'s follow-up?`,
    },
    effect: {
      pause:
        "Numa won't send any message or reminder while the follow-up is paused.",
      resume: "Numa will resume the planned messages and reminders.",
      stop: "No message or reminder will be sent any more. The file stays available.",
    },
    confirm: "Confirm",
    confirmLabel: {
      pause: (animal: string) => `Confirm pausing ${animal}'s follow-up`,
      resume: (animal: string) => `Confirm resuming ${animal}'s follow-up`,
      stop: (animal: string) => `Confirm stopping ${animal}'s follow-up`,
    },
  },
  card: {
    toConfirm: "To confirm",
    outcomes: {
      confirmed: "Appointment confirmed",
      declined: "Appointment declined",
      paused: "Follow-up paused",
      resumed: "Follow-up resumed",
      stopped: "Follow-up stopped",
    },
    expired: "No longer possible: the situation has changed since.",
  },
  choose: {
    title: "Which follow-up do you mean?",
    empty: "No ongoing follow-up to suggest.",
    candidate: (animal: string, owner: string | null) =>
      owner ? `${animal} (${owner})` : animal,
  },
  unavailable: {
    not_clinical:
      "I can't show you this file: your access doesn't include clinical data, or this follow-up doesn't exist for you.",
    no_agenda: "I can't read the agenda: your access doesn't allow it.",
    cannot_write: (animal: string) =>
      `I can't prepare a message for ${animal}: your access doesn't allow writing to owners.`,
    cannot_steer: (animal: string) =>
      `Only a vet following ${animal} can change the state of this follow-up.`,
    no_consent: (animal: string) =>
      `${animal}'s owner hasn't given consent yet: they can't be written to yet.`,
    test_followup: (animal: string) =>
      `${animal} is a test follow-up: no message is ever sent.`,
    same_status: {
      pause: (animal: string) =>
        `${animal}'s follow-up can't be paused in its current state.`,
      resume: (animal: string) => `${animal}'s follow-up is not paused.`,
      stop: (animal: string) => `${animal}'s follow-up is already stopped.`,
    },
    not_launched: (animal: string) =>
      `${animal}'s follow-up hasn't started yet: finish its launch sheet first.`,
    thisFollowup: "this follow-up",
  },
  unknown: {
    title: "I can't do that yet.",
    help: "Here is what I can prepare for you:",
    simulated:
      "In simulated mode I only answer my six requests: free conversation about the job needs the AI to be connected (AI_PROVIDER variable and key in the server's .env file).",
    aiUnavailableTitle: "The AI isn't answering right now.",
    aiUnavailable:
      "Please try again in a moment. Meanwhile, I can still prepare this:",
  },
  smalltalk: {
    greeting:
      "Hello! I'm Stive, the team's AI assistant. I prepare, you decide.",
    thanks: "You're welcome. I'm here if you need anything else.",
    identity:
      "I'm Stive, an AI, the practice team's assistant. I'm not a vet: I never diagnose and never give a dose; the decision is always yours.",
    help: "Here is what I can prepare for you:",
  },
  reply: {
    withheldNote: "Answer replaced by Stive's safeguards.",
    withheld: {
      dosage:
        "I don't give doses, dosing or prescriptions: please refer to the medicine's SPC and the practice's formulary. The decision is yours. I can help you prepare the explanation for the owner or the follow-up points.",
      prescription:
        "I don't give doses, dosing or prescriptions: please refer to the medicine's SPC and the practice's formulary. The decision is yours. I can help you prepare the explanation for the owner or the follow-up points.",
      diagnosis:
        "I don't diagnose an animal: only the vet's examination can. I can help you list the points to check or prepare the conversation with the owner.",
      identity:
        "My answer broke my rules: I'm an AI, not a vet. Could you rephrase your question?",
      contact:
        "My answer contained a link, an address or a number, which I never write. Could you rephrase your question?",
      length:
        "My answer was too long to display. Could you ask a more specific question?",
    },
  },
  limit: {
    reached: (limit: number, date: string) =>
      `You have used your ${limit} requests this month. Stive will be available again on ${date}.`,
    upgrade:
      "The Premium plan includes more requests: the practice administrator can change plans in Billing.",
    billing: "See the plans",
  },
  upsell: {
    title: "Stive, your team's AI assistant",
    description:
      "Daily briefing, file summaries, free slots, appointments to confirm, message drafts: Stive prepares, you confirm.",
    included: "Stive is included in the Pro and Premium plans.",
    action: "See the plans",
  },
  dashboard: {
    title: "Stive's briefing",
    promise: "I prepare, you decide: I never make a diagnosis.",
    askPlaceholder:
      "Ask Stive: a file summary, your free slots, a draft message…",
    calm: "Nothing to confirm for now.",
    drafts: (count: number) =>
      `${plural(count, "launch sheet", "launch sheets")} to finish`,
    nextAppointment: (time: string, title: string) =>
      `Next appointment: ${time} · ${title}`,
    open: "Open Stive",
  },
  askAbout: "Ask Stive",
  draftLoaded:
    "Draft prepared by Stive: read it and complete it, then click Send.",
};
