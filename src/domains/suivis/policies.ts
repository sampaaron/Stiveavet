import type { MemberRole } from "@/domains/auth/repository";
import type { PermissionKey } from "@/domains/equipe/permissions";
import { VET_ROLES } from "@/domains/equipe/permissions";

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

export type LaunchViewer = Viewer & { role: MemberRole };

/**
 * Préparer la fiche d'un brouillon (import, étapes, signes d'alerte) : droit de lancement et
 * accès clinique au dossier. Un assistant autorisé peut préparer ; il ne lance pas.
 */
export function canPrepareFollowup(
  viewer: LaunchViewer,
  access: FollowupAccess,
): boolean {
  return access === "clinical" && viewer.permissions.has("followups.launch");
}

/**
 * Décisions de vétérinaire (cahier des charges §4 et §5) : valider un traitement, modifier un
 * suivi en cours, le mettre en pause, l'arrêter ou le reprendre.
 */
export function canSteerFollowup(
  viewer: LaunchViewer,
  access: FollowupAccess,
): boolean {
  return canPrepareFollowup(viewer, access) && VET_ROLES.has(viewer.role);
}

/** « Lancer le suivi » : le vétérinaire responsable lui-même, au nom duquel Numa écrira. */
export function canLaunchFollowup(
  viewer: LaunchViewer,
  access: FollowupAccess,
  responsibleMembershipId: string,
): boolean {
  return (
    canSteerFollowup(viewer, access) &&
    viewer.membershipId === responsibleMembershipId
  );
}

/**
 * Écrire au propriétaire depuis Stivea Vet (cahier des charges §5, « Contrôle humain ») :
 * accès clinique et droit de répondre. Le message met Numa en pause.
 */
export function canWriteToOwner(
  viewer: Viewer,
  access: FollowupAccess,
): boolean {
  return (
    access === "clinical" && viewer.permissions.has("owner_messages.reply")
  );
}

/** « Reprendre Numa » : décision d'un vétérinaire qui peut écrire au propriétaire. */
export function canResumeNuma(
  viewer: LaunchViewer,
  access: FollowupAccess,
): boolean {
  return canWriteToOwner(viewer, access) && VET_ROLES.has(viewer.role);
}
