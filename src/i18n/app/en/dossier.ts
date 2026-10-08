import type { AppDictionary } from "../types";

export const dossier: AppDictionary["dossier"] = {
  title: "Follow-up file",
  back: "Follow-ups",
  done: {
    lance:
      "Follow-up launched: Numa will send her first message at the scheduled time, on behalf of the practice.",
    pause: "Follow-up paused: no reminders go out until it is resumed.",
    reprise: "Follow-up resumed.",
    arret: "Follow-up stopped: scheduled messages and reminders are cancelled.",
    reactivation: "Follow-up reactivated.",
    "reprise-en-main":
      "Message sent: you have taken over, and Numa is paused until you click “Resume Numa”.",
    message: "Message sent from the practice's WhatsApp.",
    numa: "Numa is back in the conversation.",
    "alerte-recue": "Receipt confirmed: the escalation is cancelled.",
    "alerte-close": "Alert closed.",
  },
  header: {
    responsible: "Responsible vet:",
    protocol: "Protocol:",
    day: (days) => `Day ${days}`,
    private: "Private file",
    protocolVersion: (name, version) => `${name}, version ${version}`,
    months: (count) => `${count} month${count === 1 ? "" : "s"}`,
    years: (count) => `${count} year${count === 1 ? "" : "s"}`,
  },
  alertsSection: "Triage alerts",
  steering: {
    draftTitle: "Follow-up in preparation",
    draftDescription:
      "Nothing is sent to the owner until the responsible vet launches the follow-up.",
    openLaunchSheet: "Open the launch sheet",
    title: "Follow-up management",
    description:
      "You can edit, pause, stop or resume this follow-up at any time.",
    edit: "Edit the follow-up",
    pause: "Pause",
    resume: "Resume the follow-up",
    reactivate: "Reactivate the follow-up",
    stop: "Stop the follow-up",
    stopWarning:
      "Numa will send nothing more for this follow-up: scheduled messages and reminders are cancelled. The conversation remains available to read.",
    confirmStop: "Confirm stop",
  },
  basic: {
    organization: "Organisation",
    owner: "Owner",
    status: "Follow-up status",
    start: "Follow-up start",
    control: "Check-up",
    notScheduled: "Not scheduled",
    intervention: "Procedure",
    procedure: "Procedure",
    date: "Date",
    protocol: "Protocol",
    restrictedTitle: "Restricted clinical data",
    restricted:
      "The conversation, photos, voice notes and summaries are only visible to people authorised to read clinical data.",
  },
  synthesis: {
    title: "Pre-consultation summary",
    description:
      "Prepared by AI from the exchanges (simulation). It does not replace your examination.",
    exchanges: (ownerMessages, photos, voiceNotes) =>
      `Exchanges: ${ownerMessages} ${ownerMessages === 1 ? "message" : "messages"} from the owner, ${photos} ${photos === 1 ? "photo" : "photos"}, ${voiceNotes} ${voiceNotes === 1 ? "voice note" : "voice notes"}.`,
    positives: "Reassuring signs",
    negatives: "Concerning signs",
    alerts: "Alerts",
    openQuestions: "Open questions",
    withheld: (count) =>
      `${count > 1 ? `${count} items were withheld by the safeguards` : "One item was withheld by the safeguards"}: read the conversation for details.`,
    generated: (date) =>
      `Prepared on ${date}, with no diagnosis or course of action.`,
    empty: "Not enough exchanges yet for a summary.",
    alertState: {
      open: "not acknowledged",
      escalated: "team notified, not acknowledged",
      acknowledged: (name) => `acknowledged by ${name}`,
      aVet: "a vet",
      resolved: "closed",
    },
  },
  contacts: {
    title: "Owners and consent",
    groupOpen:
      "WhatsApp group open with both owners and Numa. Either of them can leave it by sending STOP.",
    groupLater:
      "A WhatsApp group will be created once both contacts have accepted.",
    primary: "main contact",
    secondary: "second contact",
    phoneEnding: (ending) => `WhatsApp ending in ${ending}`,
    whatsapp: "WhatsApp",
    languageNames: { fr: "French", en: "English" },
    language: (language, source) => `${language}, ${source}`,
    languageForm: {
      label: (name) => `Numa's language with ${name}`,
      help: "Your choice takes precedence over the language recognised in their messages.",
      submit: "Correct language",
      saved: (language) =>
        `Language corrected: Numa will now write in ${language}.`,
    },
  },
  appointments: {
    title: "Appointments",
    description:
      "Numa only offers free slots in the responsible vet's calendar; the practice confirms.",
    chosenWithNuma: "chosen with Numa",
    toConfirm: "To confirm",
    confirmed: "Confirmed",
  },
  treatments: {
    title: "Approved treatments",
    importedFromDrveto: "(imported from dr.veto)",
    validatedBy: (name) => `approved by ${name}`,
    none: "No treatments to remind.",
    pending: (count) =>
      `${count > 1 ? `${count} imported treatments are awaiting your approval` : "One imported treatment is awaiting your approval"}: no reminder mentions it until then.`,
    noDosage: "Numa never creates or changes a dosage.",
  },
  imported: {
    title: "Allergies and history",
    description: "Summary imported from dr.veto (simulated).",
    none: "No imported summary for this follow-up.",
    noAllergy: "No known allergies",
    antecedents: "History",
  },
  programme: {
    title: "Next steps",
    control: (when) => `Check-up: ${when}`,
    notScheduled: "not scheduled",
    stepsLabel: "Follow-up steps",
    noSteps: "No steps scheduled.",
    full: (count) =>
      `Full programme (${count} ${count === 1 ? "step" : "steps"})`,
    states: {
      sentAt: (at) => `Sent on ${at}`,
      sent: "Sent",
      sending: "Sending",
      failed: "Sending failed (see failed tasks)",
      scheduledAt: (at) => `Scheduled for ${at}`,
      scheduled: "Scheduled",
      waitingConsent: "After the owner's consent",
      onHold: "On hold: Numa is not in charge",
      notSent: "Not sent",
      afterEnd: "After the end of the follow-up: will not be sent",
    },
    upcomingNotes: {
      waitingConsent: "after the owner's consent",
      onHold: "on hold: Numa is not in charge",
    },
    endedAutomatically: (at) =>
      `Automated follow-up ended${at ? ` on ${at}` : ""}, on the check-up date. The conversation stays open: Numa replies if the owner writes, and you are notified.`,
    stopped: (at) =>
      `Follow-up stopped${at ? ` on ${at}` : ""}: no more reminders go out.`,
    plannedEndAtControl: (at) =>
      `Automated follow-up ends on ${at}, the check-up date. The conversation will stay open.`,
    plannedEndAfterLastStep: (at) =>
      `Automated follow-up ends on ${at}, one day after the last step. The conversation will stay open.`,
    noEnd:
      "No automatic end scheduled: stop the follow-up yourself, or set a check-up appointment.",
  },
  access: {
    title: "File access",
    privateDescription:
      "Private file: visible only to you and the colleagues you share it with.",
    publicDescription:
      "Visible to practice members authorised to see all follow-ups.",
    sharedWith: "Shared with",
    until: (date) => `Until ${date}`,
    untilRevoked: "Until removed",
    noShares: "Not shared.",
    noCandidates: "No other active vet to share this file with.",
    vet: "Vet",
    choose: "Choose…",
    duration: "Duration",
    days: (count) => `${count} days`,
    share: "Share the file",
    revokeLabel: (name) => `Remove sharing with ${name}`,
    makePublic: "Make visible to the practice",
    makePrivate: "Make the file private",
    chooseVet: "Choose a vet.",
    shared: "File shared.",
    revoked: "Sharing removed.",
    madePrivate: "File made private.",
    madePublic: "File visible to the practice.",
  },
  conversation: {
    title: "WhatsApp conversation",
    aiNotice:
      "Numa is an AI: she does not diagnose, does not change any treatment and refers every medical question to the vet.",
    delivery: { queued: "sending", failed: "not sent" },
    deletedPhoto: "Photo deleted (retention period reached)",
    deletedVoice: "Voice note deleted (retention period reached)",
    photo: "Photo",
    durationUnknown: "unknown length",
    inGroup: "group",
    to: (name) => `to ${name}`,
    consent: {
      requested: "consent requested",
      given: "consent given",
      withdrawn: "STOP",
    },
    stopRequested: "STOP in the group, reply awaited",
    leftGroup: "left the group",
    notContacted: "not contacted yet",
    contactState: (name, state) => `${name}: ${state}`,
    groupOpen: "WhatsApp group open",
    groupLater: "Group created once both have accepted",
    notes: {
      group_created: (names) =>
        `Follow-up WhatsApp group created with ${names} (simulated).`,
      left_group: (name) => `${name} left the group.`,
      group_emptied: (name) =>
        `${name} left the group; nobody is left in it, so it is closed.`,
      group_stopped: (name) =>
        `Group closed: ${name} asked to stop the follow-up.`,
    },
    states: {
      stoppedByOwner:
        "An owner asked to stop the follow-up: no more automatic messages are sent.",
      notStarted:
        "Numa has not written yet: her first message goes out at the scheduled time.",
      consentRequested:
        "Awaiting the owner's consent: no follow-up content before they reply OUI.",
      consentWithdrawn:
        "The owner wrote STOP: no more messages are sent to them.",
      takeover: "You have taken over: Numa is paused.",
      paused: "Follow-up paused: Numa sends nothing.",
      endedAutomatically:
        "Automated follow-up ended on the check-up date: Numa still replies if the owner writes, and you are notified.",
      ended: "Follow-up stopped: the conversation remains available to read.",
      active: "Numa is following the conversation.",
    },
    emptyTitle: "No messages yet",
    emptyTest: "Test follow-up: nothing is sent to the owner.",
    emptyScheduled: (name) =>
      `Numa will write to ${name} at the chosen time, within the practice's sending window.`,
    readOnly:
      "Read only: replying to owners requires a permission the administrator can grant you.",
    afterConsent: "You can write to the owner once they have given consent.",
    localEnvironment: "Local environment:",
    openSimulator: "open the owner simulator",
    composer: {
      label: (names) => `Write to ${names}`,
      help: "The message is sent from the practice's business WhatsApp.",
      pausesNuma:
        "Numa pauses as soon as you write, until you click “Resume Numa”.",
      staysPaused: "Numa stays paused.",
      placeholder: (animal) => `Your message about ${animal}`,
      send: "Send",
    },
    resumeNuma: "Resume Numa",
  },
  validation: {
    emptyMessage: "Write a message.",
    messageTooLong: "Message too long.",
    choosePhoto: "Choose a photo.",
    photoTooLarge: "Photo too large: 5 MB maximum.",
    captionTooLong: "Caption too long.",
    spokenEmpty: "Write what the voice note says.",
    spokenTooLong: "Voice note too long (1,000 characters maximum).",
  },
  simulator: {
    title: "Owner simulator",
    done: {
      envoye: "Owner's message received by Stivea Vet.",
      avance: "Next scheduled message sent.",
      photo: "Owner's photo received by Stivea Vet.",
      vocal: "Owner's voice note received and transcribed (simulation).",
    },
    back: (animal) => `${animal}'s file`,
    intro: (name) =>
      `Local environment only. You are playing ${name}: your messages reach Stivea Vet as if they came from WhatsApp. Nothing is sent to a real number.`,
    personaNav: "Owner being played",
    playing: "You are playing:",
    play: (name) => `Play ${name}`,
    phoneLabel: (name) => `${name}'s WhatsApp (simulated)`,
    practice: "Veterinary practice",
    business: "WhatsApp Business (simulated)",
    messagesLabel: "Messages received and sent",
    noMessages: "No messages received yet.",
    howTitle: "How to use it",
    how: "Numa's first message goes out at the time chosen on the launch sheet. To avoid waiting, skip ahead to the next scheduled message: first message, programme reminder, then the end of the follow-up on the check-up date. Reply OUI to give consent, STOP to withdraw it, REPRENDRE to give it again.",
    mediaSection: "Photo or voice note",
    group: "Group",
    practiceFallback: "Practice",
    photoAlt: "Photo sent",
    quickReplies: "Quick replies",
    messageOf: (name) => `Message from ${name}`,
    placeholder: "Write as the owner",
    sendAsOwner: "Send as the owner",
    runDue: "Skip ahead to the next scheduled message",
    photoOf: (name) => `Photo sent by ${name}`,
    caption: "Caption (optional)",
    photoHelp:
      "JPEG, PNG or WebP, 5 MB maximum. Use an image without any real data.",
    sendPhoto: "Send the photo",
    voiceOf: (name) => `What ${name}'s voice note says`,
    voicePlaceholder:
      "For example: she has been eating well since this morning",
    voiceHelp:
      "A real audio file is created; the simulated transcript reads this text back.",
    sendVoice: "Send the voice note",
  },
};
