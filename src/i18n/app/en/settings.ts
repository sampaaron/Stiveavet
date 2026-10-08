import type { AppDictionary } from "../types";

export const settings: AppDictionary["settings"] = {
  title: "Numa, emergencies and on-call",
  description:
    "What Numa, AI assistant, applies to every follow-up of the practice. Numa never takes a medical decision: she passes on your instructions and alerts you.",
  applyDefaults: "Apply the starter settings",
  unconfigured: {
    title: "These settings have not been defined yet.",
    body: "The starter settings (messages Monday to Saturday from 8 am to 8 pm, appointments on weekdays from 9 am to 6 pm, generic emergency instructions) can then be changed here.",
  },
  windows: {
    from: "from",
    to: "to",
    start: (day: string) => `${day}: start`,
    end: (day: string) => `${day}: end`,
  },
  messageWindows: {
    title: "Message sending hours",
    description:
      "Numa only sends her scheduled messages to owners during these windows (Paris time). A reply from the owner is always received.",
    legend: "Sending days and hours",
    submit: "Save the hours",
  },
  appointments: {
    title: "Appointments offered by Numa",
    description:
      "When an owner asks for an appointment, Numa offers up to three free slots from the responsible vet's calendar, within these windows only (Paris time). If no suitable slot is available, she says the practice will call back. Every appointment awaits the team's confirmation.",
    legend: "Days and hours of offered appointments",
    submit: "Save the windows",
    duration: (kind: string) => `${kind} (minutes)`,
    submitDurations: "Save the durations",
  },
  instructions: {
    title: "Emergency instructions",
    description:
      "Passed on as written to the owner when Numa detects an emergency sign, depending on the time. Write them yourself: Numa adds no medical advice to them.",
    saveLabel: (period: string) => `Save: ${period}`,
  },
  contacts: {
    title: "Emergency contacts",
    description:
      "Numbers given to the owner along with the instructions (6 at most).",
    empty: "No emergency contact yet.",
    label: "Contact label",
    labelHint: "For example: practice reception, partner on-call clinic.",
    phone: "Number",
    add: "Add the contact",
    removeLabel: (label: string) => `Remove the contact ${label}`,
  },
  alerts: {
    title: "Alert rules",
    description: "The escalation delay can be set between 3 and 5 hours.",
    delay: "Delay before alerting the other vets",
    delayHint:
      "If an urgent alert is not acknowledged within this delay, the other vets of the practice are notified. The emergency instructions are sent to the owner immediately, without waiting.",
    photoAnalysis: "Assisted photo analysis",
    photoAnalysisHint:
      "Off by default. Numa only provides observations and risk signals; she never makes a diagnosis.",
    submit: "Save the alert rules",
  },
  onCall: {
    title: "On-call schedule",
    description:
      "An urgent alert goes first to the follow-up's responsible vet or to the on-call vet. An on-call shift lasts 14 days at most and does not overlap another.",
    empty:
      "No on-call shift planned: urgent alerts go to the follow-up's responsible vet.",
    period: (start: string, end: string) => `From ${start} to ${end}`,
    removeLabel: (name: string, start: string, end: string) =>
      `Remove the on-call shift of ${name}, from ${start} to ${end}`,
    vet: "On-call vet",
    choose: "Choose…",
    start: "Start",
    end: "End",
    add: "Add the on-call shift",
  },
  integrations: {
    title: "Connections",
    description:
      "Simulated during this phase: no real WhatsApp number, dr.veto practice or bank account is contacted.",
    simulated: "Simulated",
    connected: "Connected",
    connectedDetail: (label: string, date: string) =>
      `: ${label}, since ${date}.`,
    removeLabel: (title: string) => `Remove the ${title} connection`,
    whatsapp: {
      title: "WhatsApp Business",
      description:
        "The practice's business number, from which Numa writes to owners and where urgent alerts arrive.",
      submit: "Connect the number (simulated)",
      field: "WhatsApp Business number",
      hint: "Only the last two digits are kept.",
    },
    drveto: {
      title: "dr.veto",
      description:
        "The practice software, to find the animal, the owner and the calendar.",
      submit: "Connect dr.veto (simulated)",
      field: "dr.veto practice code",
      hint: "Fictitious code, for example CAB-1234.",
    },
    payment_mandate: {
      title: "Direct debit mandate",
      description:
        "For the pilot trial at €86 excl. VAT per month. No bank details are requested during this phase.",
      submit: "Sign the mandate (simulated)",
    },
  },
  notices: {
    defaultsApplied:
      "Starter settings applied. You can adjust them at any time.",
    messageWindowsSaved: "Sending hours saved.",
    appointmentWindowsSaved: "Appointment windows saved.",
    durationsSaved: "Appointment durations saved.",
    instructionsSaved: "Instructions saved.",
    contactAdded: "Emergency contact added.",
    contactRemoved: "Contact removed.",
    alertsSaved: "Alert rules saved.",
    onCallAdded: "On-call shift added to the schedule.",
    onCallRemoved: "On-call shift removed from the schedule.",
    connected: "Simulated connection saved.",
    disconnected: "Connection removed.",
    teamDone: "Team step completed.",
  },
  errors: {
    onCallDates: "Enter the start and end of the on-call shift.",
    onCallOrder: "The end of the on-call shift must come after its start.",
    onCallEnded: "This on-call shift has already ended.",
    onCallTooLong: "An on-call shift lasts 14 days at most.",
    drvetoCode: "dr.veto practice code: 3 to 32 letters, digits or hyphens.",
    chooseProtocol: "Choose a validated protocol.",
    invalidInput: "Check the values entered.",
  },
  validation: {
    time_format: "Time in HH:MM format.",
    end_before_start: "The end must come after the start.",
    one_window_per_day: "Only one window per day.",
    instructions_short: "Instructions: 10 characters minimum.",
    instructions_long: "Instructions: 1500 characters maximum.",
    contact_label_short: "Label: 2 characters minimum.",
    contact_label_long: "Label: 80 characters maximum.",
    phone_invalid: "Invalid phone number.",
    duration_integer: "Duration: a whole number of minutes.",
    duration_min: "Duration: 5 minutes minimum.",
    duration_max: "Duration: 120 minutes maximum.",
    duration_step: "Duration: in steps of 5 minutes.",
    on_call_vet_required: "Choose the on-call vet.",
  },
  onboarding: {
    title: "Guided setup",
    description:
      "Eight steps, five to fifteen minutes with the starter settings. Every setting can be changed afterwards.",
    progress: (done: number, total: number) =>
      `${done} of ${total} ${total === 1 ? "step" : "steps"} completed`,
    ready: {
      title: "Your practice is ready.",
      body: "You can launch your first follow-ups.",
    },
    simulated: {
      title: "Connections are simulated during this phase.",
      body: "No real WhatsApp number, dr.veto practice or bank account is contacted.",
    },
    done: "completed",
    todo: "to do",
    steps: {
      organization: "Practice and administrator account",
      whatsapp: "WhatsApp Business connection",
      drveto: "dr.veto connection",
      rules: "Hours, emergencies, on-call and alerts",
      team: "Users and permissions",
      protocols: "Starter protocols",
      billing: "Direct debit mandate and billing",
      test_followup: "First test follow-up",
    },
    organization: "Created at sign-up. You are the administrator vet.",
    rules: {
      body: "Numa's sending hours, emergency instructions for daytime, night-time, weekends and public holidays, emergency contacts, on-call schedule and escalation delay.",
      missingWindows: "the sending hours",
      missingInstructions: "the emergency instructions",
      missingContact: "an emergency contact",
      toComplete: (items: readonly string[]) =>
        `Still to complete: ${items.join(", ")}.`,
      open: "Open the settings",
    },
    team: {
      body: "Invite your vets and assistants, or skip this step if you work without a team. You can invite people later.",
      ready: "The team is ready",
      open: "Open the team",
    },
    protocols: {
      body: "Add the templates from the library, review them and validate at least one practice protocol. A protocol that has not been validated cannot be used for any follow-up.",
      open: "Open the protocols",
    },
    testFollowup: {
      body: "A fictitious animal and owner, as a draft: the test follow-up sends no message, is not counted and is not billed.",
      notAllowed: "Launching follow-ups is not among your permissions.",
      validateFirst: "Validate a practice protocol first.",
      protocol: "Test follow-up protocol",
      create: "Create the test follow-up",
    },
  },
};
