import "server-only";

import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { cache } from "react";

import type { Actor } from "@/domains/commun/actor";
import { isPermissionKey } from "@/domains/equipe/permissions";
import { restrictPermissions } from "@/domains/facturation/rules";
import type { Access, Plan } from "@/domains/facturation/rules";
import { billingSnapshot } from "@/domains/facturation/service";
import type { PermissionKey } from "@/domains/equipe/permissions";
import { requireSession } from "@/server/auth";
import { appDatabase } from "@/server/db/client";
import { membershipPermissions } from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";

/**
 * Garde serveur unique (architecture §6), dans l'ordre : personne authentifiée → membre actif
 * du cabinet (session) → permission → (dans les domaines) responsable ou partage → dossier
 * privé → audit. Les permissions sont relues en base à chaque requête : un droit retiré
 * s'applique immédiatement, sans attendre une nouvelle connexion.
 */
export type MemberContext = Actor & {
  /** Accès du cabinet selon sa facturation (impayé, résiliation, lecture seule). */
  billing: Access;
  /** Choix entre engagement annuel et mensuel à faire (ADR 0023). */
  commitmentReminder: boolean;
  /** Formule du cabinet ; null pour un cabinet antérieur aux abonnements. */
  plan: Plan | null;
  /** Suivis actifs du cabinet (hors suivis test), déjà comptés pour la facturation. */
  activeFollowups: number;
};

export const memberContext = cache(async (): Promise<MemberContext> => {
  const session = await requireSession();
  // Droits et facturation lus dans la même transaction, sans rien écrire (ADR 0040).
  const { rows, snapshot } = await withTenant(
    appDatabase(),
    { organizationId: session.organizationId, userId: session.userId },
    async (tx) => ({
      rows: await tx
        .select({ permission: membershipPermissions.permission })
        .from(membershipPermissions)
        .where(eq(membershipPermissions.membershipId, session.membershipId)),
      snapshot: await billingSnapshot(tx),
    }),
  );
  // En lecture seule ou après la fin de l'accès, seuls les droits de consultation restent
  // effectifs, et Stive suit l'offre ; les droits en base ne changent pas.
  return {
    organizationId: session.organizationId,
    userId: session.userId,
    membershipId: session.membershipId,
    role: session.role,
    permissions: restrictPermissions(
      new Set(rows.map((row) => row.permission).filter(isPermissionKey)),
      snapshot.access,
      snapshot.plan,
    ),
    billing: snapshot.access,
    commitmentReminder: snapshot.commitmentReminder,
    plan: snapshot.plan,
    activeFollowups: snapshot.activeFollowups,
  };
});

/** Sans la permission, l'écran ou l'action n'existe pas pour cette personne (404). */
export async function requirePermission(
  ...anyOf: PermissionKey[]
): Promise<MemberContext> {
  const context = await memberContext();
  if (!anyOf.some((permission) => context.permissions.has(permission)))
    notFound();
  return context;
}
