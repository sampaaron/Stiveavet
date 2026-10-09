import type { AppDictionary } from "../types";

export const errors: AppDictionary["errors"] = {
  domain: {
    not_found: "This item is no longer available.",
    forbidden: "You are not allowed to make this change.",
    vet_limit:
      "Your plan has no vet seats left (pending invitations included). Change plan in Billing.",
    already_member: "This address already belongs to a member of the practice.",
    already_invited: "An invitation is already pending for this address.",
    invalid_target:
      "This choice is no longer available. Please reload the page.",
    self_action: "You cannot change your own access.",
    last_admin: "The practice must keep at least one admin vet.",
    reassignment_required:
      "First choose the vet who takes over their ongoing follow-ups.",
    permission_not_allowed: "This permission is not available for this role.",
    already_installed: "This template is already in the practice's protocols.",
    billing_blocked:
      "New follow-ups are suspended: settle the payment in Billing. Ongoing follow-ups continue.",
    plan_vet_limit:
      "This plan has fewer vet seats than your current team (pending invitations included).",
    on_call_overlap: "This on-call shift overlaps one already planned.",
    integration_missing:
      "First connect dr.veto and the practice's WhatsApp number in Settings.",
    already_followed:
      "This animal already has a follow-up in preparation or in progress. Open it from the follow-up list.",
    launch_incomplete:
      "The sheet is not ready: choose an approved protocol and the date of the first message.",
    invalid_transition:
      "This follow-up has changed state in the meantime. Please reload the page.",
    past_step:
      "A step that has already passed can no longer be changed: choose a future delay.",
    consent_missing:
      "The owner has not given consent (or has withdrawn it): no message can be sent to them.",
    invalid_file:
      "File rejected: send a JPEG, PNG or WebP image of 5 MB at most (or a voice note).",
    capture_unreadable:
      "No free slot could be read from this screenshot. It has been deleted; try again with a sharper screenshot.",
    whatsapp_signup_failed:
      "Meta did not confirm the number connection. Start again from the button; check the PIN if the number already had one.",
    whatsapp_number_taken:
      "This WhatsApp number is already linked to another practice on Stivea Vet.",
    optin_missing:
      "Tick the owner's WhatsApp agreement, collected at the practice, before launching the follow-up.",
    payment_provider_unavailable:
      "The direct debit service is not responding right now. Nothing was charged; try again in a few minutes.",
  },
};
