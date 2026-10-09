import type { MemberRole } from "@/domains/auth/repository";

import type { PermissionKey } from "./permissions";

/** Personne qui agit, telle qu'établie par la garde serveur (session + permissions en base). */
export type Actor = {
  organizationId: string;
  userId: string;
  membershipId: string;
  role: MemberRole;
  permissions: ReadonlySet<PermissionKey>;
};

/** Refus métier : traduit en 404 (accès) ou en message (règle) par l'interface. */
export class DomainError extends Error {
  constructor(
    readonly code:
      | "not_found"
      | "forbidden"
      | "vet_limit"
      | "already_member"
      | "already_invited"
      | "invalid_target"
      | "self_action"
      | "last_admin"
      | "reassignment_required"
      | "permission_not_allowed"
      | "already_installed"
      | "on_call_overlap"
      | "billing_blocked"
      | "plan_vet_limit"
      | "integration_missing"
      | "already_followed"
      | "launch_incomplete"
      | "invalid_transition"
      | "past_step"
      | "consent_missing"
      | "invalid_file"
      | "capture_unreadable"
      | "whatsapp_signup_failed"
      | "whatsapp_number_taken"
      | "optin_missing"
      | "payment_provider_unavailable",
  ) {
    super(code);
  }
}

export function assertPermission(actor: Actor, permission: PermissionKey) {
  if (!actor.permissions.has(permission)) throw new DomainError("not_found");
}
