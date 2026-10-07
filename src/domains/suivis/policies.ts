import type { PermissionKey } from "@/domains/equipe/permissions";

export type Viewer = {
  membershipId: string;
  permissions: ReadonlySet<PermissionKey>;
};

export type FollowupFacts = {
  responsibleMembershipId: string;
  isPrivate: boolean;
  /** Membres ayant un partage actif (non révoqué, non expiré). */
  sharedWith: readonly string[];
};

/**
 * none : le dossier n'existe pas pour cette personne (réponse 404) ;
 * summary : informations d'organisation seulement (animal, propriétaire, statut, responsable) ;
 * clinical : en plus, intervention, priorité, conversation, photos, vocaux et synthèses.
 */
export type FollowupAccess = "none" | "summary" | "clinical";

/**
 * Règle de confidentialité (cahier des charges §11, architecture §6), dans l'ordre :
 * responsable ou partage explicite → dossier privé → permission globale ou de liste.
 */
export function followupAccess(
  viewer: Viewer,
  followup: FollowupFacts,
): FollowupAccess {
  const has = (permission: PermissionKey) => viewer.permissions.has(permission);
  const involved =
    followup.responsibleMembershipId === viewer.membershipId ||
    followup.sharedWith.includes(viewer.membershipId);

  const visible =
    (involved && (has("followups.read_own") || has("followups.read_all"))) ||
    (!followup.isPrivate &&
      (has("followups.read_all") || has("followups.read_summary")));
  if (!visible) return "none";
  return has("clinical.read") ? "clinical" : "summary";
}

/** Seul le vétérinaire responsable partage son dossier ou le rend privé. */
export function canManageFollowupAccess(
  viewer: Viewer,
  followup: Pick<FollowupFacts, "responsibleMembershipId">,
): boolean {
  return (
    followup.responsibleMembershipId === viewer.membershipId &&
    viewer.permissions.has("followups.share")
  );
}
