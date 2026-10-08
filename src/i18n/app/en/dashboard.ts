import type { AppDictionary } from "../types";

export const dashboard: AppDictionary["dashboard"] = {
  title: "Today",
  greeting: (firstName: string) => `Hello ${firstName}`,
  headline: (day: string, urgent: number, watch: number) =>
    `${day} · ${urgent} ${urgent === 1 ? "emergency" : "emergencies"} and ${watch} ${watch === 1 ? "case" : "cases"} to watch`,
  empty: {
    title: "No follow-ups yet",
    admin:
      "Your practice is set up. The guided setup walks you through WhatsApp, dr.veto, emergencies, team, protocols and a test follow-up. Your follow-ups will appear here.",
    member: "Your follow-ups will appear here.",
    guidedSetup: "Open the guided setup",
  },
  actions: {
    openAFile: "Open a file",
    launch: "Launch a follow-up",
    openFile: "Open the file",
    writeToOwner: "Write to the owner",
    allFollowups: "All follow-ups",
    agenda: "Calendar",
  },
  summary: {
    paused: "Follow-up paused: no reminders are being sent",
    humanTakeover: "The team has taken over the conversation: Numa is paused",
    consentWithdrawn: "The owner replied STOP: no further messages are sent",
    consentRequested: "First message sent, awaiting consent",
    notStarted: "Numa's first message is coming up",
    quiet: "No news from the owner yet",
  },
  owner: {
    photo: "photo received",
    voice: "voice note received",
    photoOnly: "Photo received",
    voiceOnly: "Voice note received",
    messageOnly: "Message received",
    quote: (text: string) => `“${text}”`,
    quoteWith: (text: string, media: string) => `“${text}”, ${media}`,
  },
  dayLabel: (days: number) => `Day ${days}`,
  urgentReportedAt: (animalName: string, time: string) =>
    `${animalName}: emergency reported at ${time}`,
  urgentOngoing: (animalName: string) => `${animalName}: ongoing emergency`,
  stats: {
    urgent: "Emergencies",
    urgentHint: "To handle now",
    watch: "To watch",
    watchHint: "Flagged by Numa",
    active: "Active follow-ups",
    appointments: "Stivea appointments",
    appointmentsHint: "Today, confirmed by the practice",
  },
  priorities: {
    title: "Priorities",
    description:
      "Emergencies and cases to watch, from most serious to most recent.",
    emptyTitle: "No priorities",
    emptyDescription: "All follow-ups are progressing normally.",
  },
  others: {
    title: "Other active follow-ups",
    empty: "No other active follow-ups",
  },
  organization: {
    title: "Practice follow-ups",
    description:
      "Organisational view. Clinical data is restricted to authorised people.",
    empty: "No follow-ups to show",
  },
  agenda: {
    title: "Today's calendar",
    description:
      "Full dr.veto calendar (simulated); Stivea appointments are marked.",
    emptyTitle: "No appointments today",
    emptyDescription: "Connect dr.veto in settings to see the full calendar.",
  },
  quickActions: "Quick actions",
  numa: (animals: number) =>
    `Follows ${animals} ${animals === 1 ? "animal" : "animals"} for the practice. She never makes a diagnosis and escalates whenever in doubt.`,
  stive:
    "Your daily briefing will be ready here. Any real action will wait for your confirmation.",
  notFound: {
    title: "This screen is not available yet",
    description:
      "It is coming in an upcoming phase 1 release. The data shown in Stivea remains fictitious.",
    back: "Back to Today",
  },
  billing: {
    open: "Open billing",
    grace: (date: string) =>
      `Direct debit declined: please settle before ${date}.`,
    blocked:
      "New follow-ups are suspended. Ongoing follow-ups continue until they end.",
    readOnly: (date: string) => `Practice in read-only mode until ${date}.`,
    closed: "Access to the practice has ended.",
  },
};
