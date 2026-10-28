import type { AppDictionary } from "../types";

export const tasks: AppDictionary["tasks"] = {
  title: "Automations",
  description:
    "What Stivea Vet does on its own, following your protocols and settings, and the sends that did not go through. No automation makes a medical decision.",
  automations: {
    title: "What runs on its own",
    items: [
      {
        title: "Follow-up plan reminders",
        text: "Each planned step goes out on time, with the owner's consent and within your sending hours.",
      },
      {
        title: "Numa's replies",
        text: "Numa replies to owners and gathers their news, following the follow-up's protocol.",
      },
      {
        title: "Team alerts",
        text: "A worrying reply alerts the vet, then the others if nobody sees it within the set delay.",
      },
      {
        title: "Voice messages and photos",
        text: "Voice messages are transcribed; photos are described if you turned it on. The team reads and decides.",
      },
      {
        title: "End of follow-ups",
        text: "The automated follow-up ends on the date set by its protocol.",
      },
      {
        title: "Data deletion",
        text: "Files and follow-ups past their retention period are deleted.",
      },
    ],
    settings: "Set sending hours and alerts",
  },
  failedTitle: "Failed tasks",
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
    "whatsapp.media": "Photo or voice note received on WhatsApp",
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
