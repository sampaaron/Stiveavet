import "server-only";

import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { cache } from "react";

import type { Actor } from "@/domains/equipe/actor";
import { isPermissionKey } from "@/domains/equipe/permissions";
import { restrictPermissions } from "@/domains/facturation/rules";
import type { Access } from "@/domains/facturation/rules";
import type { PermissionKey } from "@/domains/equipe/permissions";
import { requireSession } from "@/server/auth";
import { appDatabase } from "@/server/db/client";
import { membershipPermissions } from "@/server/db/schema";
import { services } from "@/server/services";
import { withTenant } from "@/server/db/tenant";
import type { TenantTransaction } from "@/server/db/tenant";

/**
 * Garde serveur unique (architecture §6), dans l'ordre : personne authentifiée → membre actif
 * du cabinet (session) → permission → (dans les domaines) responsable ou partage → dossier
 * privé → audit. Les permissions sont relues en base à chaque requête : un droit retiré
 * s'applique immédiatement, sans attendre une nouvelle connexion.
 */
export type MemberContext = Actor & {
  /** Accès du cabinet selon sa facturation (impayé, résiliation, lecture seule). */
  billing: Access;
};

export const memberContext = cache(async (): Promise<MemberContext> => {
  const session = await requireSession();
  const rows = await withTenant(
    appDatabase(),
    { organizationId: session.organizationId, userId: session.userId },
    (tx) =>
      tx
        .select({ permission: membershipPermissions.permission })
        .from(membershipPermissions)
        .where(eq(membershipPermissions.membershipId, session.membershipId)),
  );
  // En lecture seule ou après la fin de l'accès, seuls les droits de consultation restent
  // effectifs ; les droits en base ne changent pas et reviennent après régularisation.
  const billing = await services.billing().accessFor({
    organizationId: session.organizationId,
    userId: session.userId,
  });
  return {
    organizationId: session.organizationId,
    userId: session.userId,
    membershipId: session.membershipId,
    role: session.role,
    permissions: restrictPermissions(
      new Set(rows.map((row) => row.permission).filter(isPermissionKey)),
      billing,
    ),
    billing,
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

/** Transaction sous le cabinet et la personne du contexte (RLS). */
export function withMember<T>(
  context: MemberContext,
  run: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  return withTenant(
    appDatabase(),
    { organizationId: context.organizationId, userId: context.userId },
    run,
  );
}
