import type { AppDictionary } from "../types";

export const tasks: AppDictionary["tasks"] = {
  title: "Failed tasks",
  description:
    "Messages, reminders and alerts that Stivea Vet could not complete after several spaced-out attempts. Retry them once the cause is fixed, or abandon them.",
  done: {
    retried: "Task retried: the worker will pick it up in a moment.",
    cancelled: "Task abandoned: it will not be attempted again.",
  },
  count: (count: number) =>
    count === 1 ? "1 failed task" : `${count} failed tasks`,
  allGood: "Everything is working",
  empty: {
    title: "No failed tasks",
    description:
      "Messages and reminders in difficulty will appear here after their last attempt.",
  },
  attempts: (count: number, failedAt: string) =>
    `${count} attempt${count === 1 ? "" : "s"} · last failure on ${failedAt}`,
  openFile: "Open the file",
  retry: "Retry",
  retryLabel: (task: string) => `Retry: ${task}`,
  cancel: "Abandon",
  cancelLabel: (task: string) => `Abandon: ${task}`,
  kinds: {
    "followup.reminder": "Reminder to the owner",
    "followup.message": "Message from Numa",
    "followup.end": "End of the automated follow-up",
    "alert.escalate": "Escalation of an urgent alert",
    "alert.notify": "Alert to the vet",
    "media.transcribe": "Transcript of a voice note",
    "media.observe": "Photo analysis",
    "attachment.purge": "File deletion",
    "retention.sweep": "Search for data past its retention date",
    "followup.purge": "Erasure of a follow-up past its retention date",
    "billing.annual_offer": "Annual commitment offer e-mail",
    "whatsapp.send": "WhatsApp message",
    "alert.deliver": "WhatsApp alert to a vet",
    "notify.whatsapp_failed": "E-mail about a failed WhatsApp message",
  },
  unknownKind: "Technical task",
  errors: {
    provider_unavailable: "Sending service unavailable",
    provider_rejected: "Sending refused by the service",
    provider_account: "Practice WhatsApp account needs reconnecting",
    recipient_unreachable: "Number unreachable on WhatsApp",
    invalid_payload: "Invalid task data",
    target_missing: "File or recipient not found",
    lease_expired: "Interrupted by a worker shutdown",
    unexpected_error: "Unexpected error",
  },
};
