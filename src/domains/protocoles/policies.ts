import type { MemberRole } from "@/domains/auth/repository";
import type { PermissionKey } from "@/domains/equipe/permissions";
import { VET_ROLES } from "@/domains/equipe/permissions";

export type ProtocolViewer = {
  membershipId: string;
  role: MemberRole;
  permissions: ReadonlySet<PermissionKey>;
};

/** NULL : protocole du cabinet ; sinon protocole personnel de ce membre. */
export type ProtocolFacts = { ownerMembershipId: string | null };

const has = (viewer: ProtocolViewer, permission: PermissionKey) =>
  viewer.permissions.has(permission);

/** Peut ouvrir l'écran des protocoles. */
export function canBrowseProtocols(viewer: ProtocolViewer): boolean {
  return (
    has(viewer, "protocols.manage") ||
    has(viewer, "protocols.create_own") ||
    has(viewer, "followups.launch")
  );
}

/**
 * Lecture : protocoles du cabinet pour qui les gère, en crée ou lance des suivis ; protocoles
 * personnels pour leur auteur, et pour qui gère les protocoles du cabinet (vue d'ensemble).
 */
export function canReadProtocol(
  viewer: ProtocolViewer,
  protocol: ProtocolFacts,
): boolean {
  if (!canBrowseProtocols(viewer)) return false;
  if (protocol.ownerMembershipId === null) return true;
  return (
    protocol.ownerMembershipId === viewer.membershipId ||
    has(viewer, "protocols.manage")
  );
}

/** Modification (nouvelle version), archivage : le cabinet, ou l'auteur de son protocole. */
export function canEditProtocol(
  viewer: ProtocolViewer,
  protocol: ProtocolFacts,
): boolean {
  if (protocol.ownerMembershipId === null)
    return has(viewer, "protocols.manage");
  return (
    protocol.ownerMembershipId === viewer.membershipId &&
    has(viewer, "protocols.create_own")
  );
}

/** Seul un vétérinaire valide le contenu d'un protocole, dont ses signes d'alerte. */
export function canValidateProtocol(
  viewer: ProtocolViewer,
  protocol: ProtocolFacts,
): boolean {
  return VET_ROLES.has(viewer.role) && canEditProtocol(viewer, protocol);
}

export type ProtocolScope = "cabinet" | "personal";

/** Création ou copie : dans le cabinet (gestion) ou pour soi (protocoles personnels). */
export function canCreateProtocol(
  viewer: ProtocolViewer,
  scope: ProtocolScope,
): boolean {
  return scope === "cabinet"
    ? has(viewer, "protocols.manage")
    : has(viewer, "protocols.create_own");
}
