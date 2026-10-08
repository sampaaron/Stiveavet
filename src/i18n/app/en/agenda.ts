import type { AppDictionary } from "../types";

export const agenda: AppDictionary["agenda"] = {
  title: "Calendar",
  description:
    "Free slots that Numa may offer to owners. Every appointment is still confirmed by the practice.",
  done: {
    capture: (count: number) =>
      `Screenshot read: ${count} free ${count === 1 ? "slot" : "slots"} saved. The file has been deleted.`,
    retire: "Slot removed.",
    confirme: "Appointment confirmed. Numa is letting the owner know.",
    refuse:
      "Slot declined. Numa is letting the owner know that the practice will get back in touch.",
    rappele: "Request marked as called back.",
  },
  slots: {
    title: "Upcoming free slots",
    description:
      "Read from calendar screenshots. Reading is simulated in this version.",
    emptyTitle: "No free slots saved",
    emptyDescription:
      "Send a screenshot of the calendar: its free slots will appear here.",
    dayListLabel: (day: string) => `Free slots on ${day}`,
    removeLabel: (day: string, start: string, end: string, vet: string) =>
      `Remove the slot on ${day}, ${start} to ${end}, ${vet}`,
  },
  capture: {
    title: "Send a calendar screenshot",
    description: "Until the calendar can be connected directly (dr.veto).",
    beforeTitle: "Before sending",
    beforeText:
      "Hide names, reasons for visit and any unnecessary information: leave only the free slots visible. The screenshot is deleted as soon as the slots have been read.",
    vetLabel: "Calendar for",
    fileLabel: "Calendar screenshot",
    fileHint: "JPEG, PNG or WebP, 5 MB maximum.",
    submit: "Read the free slots",
  },
  recentCaptures: {
    title: "Recent screenshots",
    description:
      "No screenshot is kept: only the record of its deletion remains.",
    received: (when: string) => `Received on ${when}`,
    deleted: (when: string) => `, deleted on ${when}`,
    deleting: ", deletion in progress",
  },
  pending: {
    title: "Appointments to confirm",
    descriptionCanConfirm:
      "Slots chosen by owners from those offered by Numa. Numa tells them your decision.",
    descriptionReadOnly:
      "Slots chosen by owners. A vet, or an assistant authorised by the administrator, confirms them.",
    empty: "No pending appointments.",
    withVet: (vet: string) => `with ${vet}`,
    confirm: "Confirm",
    decline: "Decline",
    confirmLabel: (animal: string, when: string) =>
      `Confirm the appointment for ${animal}, ${when}`,
    declineLabel: (animal: string, when: string) =>
      `Decline the appointment for ${animal}, ${when}`,
  },
  callbacks: {
    title: "Requests to call back",
    description:
      "Numa had no suitable slot with the responsible vet: she said that the practice would call back.",
    empty: "No requests to call back.",
    requested: (when: string) => `Requested on ${when}`,
    done: "Called back",
    doneLabel: (animal: string, when: string) =>
      `Mark as called back: ${animal}, request of ${when}`,
  },
  validation: {
    vet: "Choose the vet concerned.",
    file: "Choose a screenshot.",
    tooLarge: "Screenshot too large: 5 MB maximum.",
  },
};
