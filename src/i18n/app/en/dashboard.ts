import type { AppDictionary } from "../types";

export const dashboard: AppDictionary["dashboard"] = {
  title: "Today",
  greeting: (firstName: string) => `Hello ${firstName}`,
  headline: (day: string, urgent: number, watch: number) =>
    `${day} · ${urgent} ${urgent === 1 ? "emergency" : "emergencies"} and ${watch} ${watch === 1 ? "case" : "cases"} to watch`,
  headlineShort: (urgent: number, watch: number) =>
    `${urgent} ${urgent === 1 ? "emergency" : "emergencies"} and ${watch} ${watch === 1 ? "case" : "cases"} to watch`,
  briefing: {
    title: "Numa's update",
    clinical: (active: number, urgent: number, watch: number) => {
      const parts = [
        urgent
          ? `${urgent} ${urgent === 1 ? "emergency is" : "emergencies are"} waiting for a vet`
          : null,
        watch
          ? `${watch} ${watch === 1 ? "case needs" : "cases need"} watching`
          : null,
      ].filter((part): part is string => part !== null);
      const signals = parts.length
        ? `${parts.join(" and ")}.`
        : "No alert pending.";
      const first = signals.charAt(0).toUpperCase() + signals.slice(1);
      return `I'm following ${active} ${active === 1 ? "animal" : "animals"} right now. ${first} I never make a diagnosis: the decision is always yours.`;
    },
    summary: (active: number) =>
      `I'm following ${active} ${active === 1 ? "animal" : "animals"} for the practice. I never make a diagnosis and I refer every medical question to the team.`,
    searchPlaceholder: "Search for an animal, an owner, a procedure…",
    searchSubmit: "Search follow-ups",
  },
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
    newAnimal: "Register an animal",
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
  activity: {
    title: "Practice activity",
    description: "Last 30 days, test follow-ups excluded.",
    launched: "Follow-ups started",
    launchedHint: (ongoing: number) =>
      `${ongoing} ${ongoing === 1 ? "follow-up" : "follow-ups"} running`,
    ended: "Follow-ups ended",
    endedHint: "Check-up reached or stopped",
    messages: "Messages received",
    messagesHint: (outbound: number) => `${outbound} sent by Numa and the team`,
    response: "Response rate",
    responseHint: (answered: number, launched: number) =>
      `${answered} of ${launched} owners replied`,
    responseNone: "No follow-ups started in this period",
    alerts: "Alerts",
    alertsHint: (open: number) => `${open} open right now`,
    medianAck: (minutes: string) => `Acknowledged within ${minutes} (median)`,
    chartTitle: "Messages over the last 14 days",
    inbound: "Owners",
    outbound: "Numa and team",
    chartRow: (day: string, inbound: number, outbound: number) =>
      `${day}: ${inbound} received, ${outbound} sent`,
  },
  next: {
    title: "Next actions",
    drafts: (count: number) =>
      `${count} ${count === 1 ? "sheet" : "sheets"} to launch`,
    unacknowledged: (count: number) =>
      `${count} unacknowledged ${count === 1 ? "alert" : "alerts"}`,
    controls: (count: number) =>
      `${count} ${count === 1 ? "check-up" : "check-ups"} this week`,
    consent: (count: number) =>
      `${count} WhatsApp ${count === 1 ? "consent" : "consents"} pending`,
    none: "Nothing pending.",
  },
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
    appointment: (kind, animal) => `${kind} · ${animal}`,
    otherAppointment: "Appointment",
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
    annualChoice:
      "Annual commitment or monthly billing: your choice. If you do not answer, nothing switches.",
  },
};
