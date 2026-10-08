import type { AppDictionary } from "../types";

export const journal: AppDictionary["journal"] = {
  title: "Activity log",
  description:
    "Who did what, and when. The log can be neither edited nor deleted.",
  actionsTitle: "Actions",
  noActions: "No actions recorded",
  loginsTitle: "Sign-ins",
  noLogins: "No sign-ins recorded",
  removedMember: "Former member",
  system: "System",
  unknownUser: "Unknown",
  someMember: "a member",
  joined: (actor: string) => `${actor} joined the practice`,
  joinedOnInvitation: (member: string, actor: string) =>
    `${member} joined the practice, invited by ${actor}`,
  onMember: {
    "membership.deactivated": (actor: string, member: string) =>
      `${actor} removed access for ${member}`,
    "membership.reactivated": (actor: string, member: string) =>
      `${actor} restored access for ${member}`,
    "membership.permissions_changed": (actor: string, member: string) =>
      `${actor} changed the permissions of ${member}`,
    "membership.role_changed": (actor: string, member: string) =>
      `${actor} changed the role of ${member}`,
  },
  byMember: {
    "organization.created": (actor: string) => `${actor} created the practice`,
    "invitation.created": (actor: string) => `${actor} sent an invitation`,
    "invitation.revoked": (actor: string) => `${actor} cancelled an invitation`,
    "followup.viewed": (actor: string) => `${actor} viewed a file`,
    "followup.shared": (actor: string) => `${actor} shared a file`,
    "followup.unshared": (actor: string) =>
      `${actor} removed a share on a file`,
    "followup.privacy_changed": (actor: string) =>
      `${actor} changed the privacy of a file`,
    "followup.reassigned": (actor: string) => `${actor} reassigned a file`,
    "followup.prepared": (actor: string) =>
      `${actor} prepared a follow-up from dr.veto`,
    "followup.protocol_chosen": (actor: string) =>
      `${actor} chose the protocol of a follow-up`,
    "followup.plan_updated": (actor: string) =>
      `${actor} edited a follow-up's launch sheet`,
    "followup.treatments_validated": (actor: string) =>
      `${actor} validated imported treatments`,
    "followup.launched": (actor: string) => `${actor} launched a follow-up`,
    "followup.paused": (actor: string) => `${actor} paused a follow-up`,
    "followup.resumed": (actor: string) => `${actor} resumed a follow-up`,
    "followup.stopped": (actor: string) => `${actor} stopped a follow-up`,
    "followup.reactivated": (actor: string) =>
      `${actor} reactivated a follow-up`,
    "followup.human_takeover": (actor: string) =>
      `${actor} took over a conversation (Numa paused)`,
    "followup.numa_resumed": (actor: string) =>
      `${actor} handed the conversation back to Numa`,
    "conversation.message_sent": (actor: string) =>
      `${actor} wrote to an owner`,
    "simulator.owner_message": (actor: string) =>
      `${actor} simulated an owner message (local)`,
    "simulator.owner_media": (actor: string) =>
      `${actor} simulated a photo or voice note from an owner (local)`,
    "attachment.opened": (actor: string) =>
      `${actor} opened a photo or voice note from a follow-up`,
    "agenda.capture_read": (actor: string) =>
      `${actor} sent a calendar screenshot: free slots read, screenshot deleted`,
    "agenda.slot_removed": (actor: string) =>
      `${actor} removed a free slot from the calendar`,
    "synthesis.generated": (actor: string) =>
      `Pre-consultation summary prepared by the AI (simulation) when ${actor} opened a file`,
    "appointment.confirmed": (actor: string) =>
      `${actor} confirmed an appointment chosen with Numa`,
    "appointment.declined": (actor: string) =>
      `${actor} declined a slot chosen with Numa`,
    "appointment.callback_done": (actor: string) =>
      `${actor} called back an owner who asked for an appointment`,
    "settings.appointment_windows_changed": (actor: string) =>
      `${actor} changed Numa's appointment windows`,
    "settings.appointment_durations_changed": (actor: string) =>
      `${actor} changed the appointment durations`,
    "alert.acknowledged": (actor: string) => `${actor} acknowledged an alert`,
    "alert.resolved": (actor: string) => `${actor} closed an alert`,
    "job.retried": (actor: string) => `${actor} retried a failed task`,
    "job.cancelled": (actor: string) => `${actor} abandoned a failed task`,
    "followup.test_created": (actor: string) =>
      `${actor} created a test follow-up`,
    "protocol.created": (actor: string) => `${actor} created a protocol`,
    "protocol.duplicated": (actor: string) => `${actor} duplicated a protocol`,
    "protocol.installed": (actor) =>
      `${actor} added a protocol from the library`,
    "protocol.version_created": (actor) =>
      `${actor} created a new version of a protocol`,
    "protocol.validated": (actor: string) => `${actor} validated a protocol`,
    "protocol.archived": (actor: string) => `${actor} archived a protocol`,
    "protocol.restored": (actor: string) =>
      `${actor} restored an archived protocol`,
    "settings.alerts_changed": (actor: string) =>
      `${actor} changed the alert settings`,
    "settings.defaults_applied": (actor) =>
      `${actor} applied Numa's default settings`,
    "settings.emergency_contact_added": (actor) =>
      `${actor} added an emergency contact`,
    "settings.emergency_contact_removed": (actor) =>
      `${actor} removed an emergency contact`,
    "settings.emergency_instructions_changed": (actor) =>
      `${actor} changed the emergency instructions`,
    "settings.message_windows_changed": (actor) =>
      `${actor} changed Numa's sending hours`,
    "settings.on_call_added": (actor: string) =>
      `${actor} added an on-call shift`,
    "settings.on_call_removed": (actor: string) =>
      `${actor} removed an on-call shift`,
    "integration.connected": (actor) =>
      `${actor} connected a service (WhatsApp, dr.veto or direct debit)`,
    "integration.disconnected": (actor) =>
      `${actor} disconnected a service (WhatsApp, dr.veto or direct debit)`,
    "onboarding.step_completed": (actor) =>
      `${actor} completed a step of the guided setup`,
    "subscription.plan_changed": (actor: string) => `${actor} changed plan`,
    "subscription.cycle_chosen": (actor) =>
      `${actor} chose monthly or annual billing`,
    "subscription.canceled": (actor: string) =>
      `${actor} cancelled the subscription`,
    "subscription.settlement_requested": (actor) =>
      `${actor} retried a failed direct debit`,
  },
  automatic: {
    "numa.reply_blocked":
      "Safeguard: a reply from Numa was replaced with a referral to the vet",
    "attachment.purged":
      "A file that reached the end of its retention period was deleted",
    "photo.observation_blocked":
      "Safeguard: an observation from the photo analysis was discarded (it looked like medical advice)",
    "followup.purged":
      "A follow-up that reached one year of retention was erased; only anonymous statistics remain",
    "followup.ended_automatically":
      "Automated follow-up ended on the check-up date (the conversation stays open)",
    "conversation.group_created":
      "Both owners agreed: WhatsApp group created with Numa (simulated)",
    "conversation.left_group": "An owner left the follow-up's WhatsApp group",
    "conversation.owner_stopped_all":
      "An owner asked to stop the follow-up: no more automatic messages",
    "appointment.requested": "An owner asked Numa for an appointment",
    "appointment.proposed":
      "An owner chose a slot offered by Numa (to be confirmed)",
    "alert.raised": "Triage: an owner's message opened an alert",
    "alert.escalated":
      "Urgent case not acknowledged: the whole veterinary team was alerted",
    "invoice.issued": "Invoice issued",
    "billing.annual_offer_sent":
      "Annual commitment offer e-mailed to whoever manages billing",
    "invoice.paid": "Invoice direct debit succeeded",
    "invoice.payment_failed": "Invoice direct debit failed",
  },
  ownerLanguageDetected: (owner: "primary" | "secondary", language: string) =>
    `Numa's language recognised in the ${owner === "secondary" ? "second owner's" : "owner's"} messages: ${language}`,
  ownerLanguageChanged: (
    owner: "primary" | "secondary",
    language: string,
    actor: string,
  ) =>
    `Numa's language corrected for the ${owner === "secondary" ? "second owner" : "owner"} by ${actor}: ${language}`,
  logins: {
    login_succeeded: "Sign-in succeeded",
    login_failed: "Sign-in refused",
    login_rate_limited: "Sign-in blocked (too many attempts)",
    code_sent: "Security code sent",
    code_failed: "Security code refused",
    session_locked: "Session locked",
    session_unlocked: "Session unlocked",
    unlock_failed: "Unlock refused",
    logout: "Sign-out",
    password_reset_requested: "Password reset requested",
    password_reset_completed: "Password reset",
    signup_completed: "Account created",
  },
};
