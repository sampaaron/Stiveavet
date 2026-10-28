import type { AppDictionary } from "../types";

export const dashboard: AppDictionary["dashboard"] = {
  title: "Today",
  greeting: (firstName: string) => `Hello ${firstName}`,
  headlineShort: (urgent: number, watch: number) =>
    `${urgent} ${urgent === 1 ? "emergency" : "emergencies"} and ${watch} ${watch === 1 ? "case" : "cases"} to watch`,
  briefing: {
    title: "Your daily briefing",
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
      return `${active} ${active === 1 ? "animal" : "animals"} followed right now. ${first}`;
    },
    summary: (active: number) =>
      `${active} ${active === 1 ? "animal" : "animals"} followed right now for the practice.`,
    searchPlaceholder: "Search for an animal, an owner, a procedure…",
    searchSubmit: "Search follow-ups",
  },
  numa: {
    title: "Numa",
    text: (active: number) =>
      `talks with the owners of ${active} followed ${active === 1 ? "animal" : "animals"} and passes on anything that needs a vet.`,
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
  operated: {
    title: "Operated today",
    description:
      "Read from dr.veto. Preparing the sheet takes the procedure, the suggested protocol, the first message time and the check-up.",
    at: (time: string) => `Operated at ${time}`,
    by: (vet: string) => `by ${vet}`,
    prepare: "Prepare the sheet",
    prepareAll: (count: number) => `Prepare all (${count})`,
    draft: "Sheet ready to launch",
    open: "Follow-up in progress",
    done: (count: number) =>
      count
        ? `${count} sheet${count > 1 ? "s" : ""} prepared: review ${count > 1 ? "them" : "it"} in “Ready to launch”.`
        : "No sheet prepared: these animals are already followed.",
  },
  ready: {
    title: "Ready to launch",
    description:
      "Sheets prepared by the team. Review each card: only the responsible vet launches the follow-up.",
    protocol: (name: string) => `Protocol “${name}”`,
    noProtocol: "No protocol chosen",
    firstMessage: (at: string) => `First message: ${at}`,
    firstMessageNow: "First message as soon as it is launched",
    control: (at: string) => `Check-up: ${at}`,
    treatments: (count: number) =>
      count > 1
        ? `${count} treatments imported from dr.veto, approved on launch:`
        : "1 treatment imported from dr.veto, approved on launch:",
    blockers: {
      launch_incomplete: "Sheet to complete",
      integration_missing: "WhatsApp to connect to the practice",
      optin_missing: "Owner's WhatsApp agreement to record",
    },
    waiting: (vet: string) => `Ready, waiting for ${vet}`,
    launch: "Launch",
    launchWithTreatments: (count: number) =>
      count > 1
        ? `Approve the ${count} treatments and launch`
        : "Approve the treatment and launch",
    review: "Review the sheet",
    complete: "Complete the sheet",
    forAnimal: (animal: string) => `: ${animal}`,
    recordOptIn: "Record the owner's agreement",
    recordOptInHint:
      "Collected at reception: the owner agrees to be contacted on WhatsApp.",
    optInRecorded: "WhatsApp agreement recorded.",
    launchAll: (count: number) => `Launch all (${count})`,
    launchAllTitle: (count: number) =>
      `Launch ${count} follow-up${count > 1 ? "s" : ""}?`,
    launchAllDescription:
      "The imported treatments shown on each card will be approved in your name. Numa will then send each first message at the planned time.",
    launchAllConfirm: "Launch all",
    done: (launched: number, failed: number) =>
      [
        launched
          ? `${launched} follow-up${launched > 1 ? "s" : ""} launched: Numa will send each first message at the planned time.`
          : null,
        failed
          ? failed > 1
            ? `${failed} sheets changed or are no longer ready: open them to review.`
            : "1 sheet changed or is no longer ready: open it to review."
          : null,
      ]
        .filter((part) => part !== null)
        .join(" "),
  },
  timeSaved: {
    line: (duration: string, checkIns: number) =>
      `About ${duration} saved over 30 days: ${checkIns} check-in${checkIns > 1 ? "s" : ""} made by Numa instead of a phone call.`,
    how: (callMinutes: number, launchMinutes: number) =>
      `Estimate: ${callMinutes} min per call avoided, minus ${launchMinutes} min per follow-up launched.`,
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
    quiet: (count: number) =>
      `${count} follow-up${count > 1 ? "s" : ""}: nothing to report`,
    quietHint:
      "No warning sign from the protocol. Open the list only if needed.",
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
