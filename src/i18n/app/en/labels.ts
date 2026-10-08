import type { AppDictionary } from "../types";

export const labels: AppDictionary["labels"] = {
  roles: {
    admin_vet: "Admin vet",
    vet: "Vet",
    assistant: "Veterinary assistant",
  },
  permissions: {
    "organization.settings": "Change the practice settings",
    "team.manage": "Manage the team and permissions",
    "protocols.manage": "Create and edit protocols",
    "protocols.create_own": "Create and edit their own protocols",
    "billing.manage": "Manage the subscription and billing",
    "activity_log.read": "View the activity log",
    "followups.read_all":
      "See all the practice's follow-ups (except private files)",
    "followups.read_own": "See their follow-ups and those shared with them",
    "followups.read_summary":
      "See the organisational list of follow-ups, without clinical data",
    "followups.launch":
      "Prepare and launch a follow-up (launching is for vets only)",
    "followups.share": "Share their follow-ups with a colleague",
    "clinical.read":
      "Read conversations, photos, voice notes and clinical summaries",
    "owner_messages.reply": "Reply to owners",
    "appointments.confirm": "Confirm an appointment manually",
    "agenda.read": "View the calendar",
    "agenda.capture": "Send a calendar screenshot (free slots)",
    "stive.use": "Use Stive, the internal AI assistant",
  },
  followupStatus: {
    draft: "Draft",
    active: "Active",
    paused: "Paused",
    human_takeover: "Taken over by the team",
    ended: "Ended",
  },
  species: { dog: "Dog", cat: "Cat", both: "Dog and cat" },
  triage: { normal: "Normal", watch: "To watch", urgent: "Urgent" },
  protocolCategories: {
    surgery: "Surgery",
    dental: "Dental",
    treatment: "Treatment follow-up",
    other: "Other",
  },
  stepKinds: {
    message: "Message",
    question: "Question",
    photo_request: "Photo request",
    reminder: "Reminder",
    control: "Check-up appointment",
  },
  appointmentKinds: {
    post_op_control: "Post-operative check-up",
    emergency: "Emergency",
    treatment_followup: "Treatment follow-up",
    other: "Other appointment",
  },
  weekdays: {
    1: "Monday",
    2: "Tuesday",
    3: "Wednesday",
    4: "Thursday",
    5: "Friday",
    6: "Saturday",
    7: "Sunday",
  },
  emergencyPeriods: {
    day: "During practice hours",
    night: "At night",
    weekend: "At weekends",
    holiday: "On public holidays",
  },
  plans: {
    solo: { name: "Solo", stive: "Limited Stive" },
    solo_pro: { name: "Solo Pro", stive: "Fuller Stive" },
    clinic: { name: "Clinic", stive: "One Stive per vet, with a lower limit" },
    clinic_pro: {
      name: "Clinic Pro",
      stive: "A fuller personal Stive for each vet",
    },
  },
  triageReasons: {
    red_flag: "Emergency signal recognised in the owner's message.",
    rule: (sign) => `Warning sign for this follow-up: ${sign}`,
    concern:
      "Worry or sign to check, with no recognised warning sign: escalated as a precaution.",
    none: "No warning sign.",
    after_end: "The owner wrote again after the automated follow-up ended.",
  },
  languages: { fr: "French", en: "English" },
  languageSources: {
    import: "from the patient file",
    detected: "recognised in their messages",
    vet: "chosen by the practice",
  },
};
