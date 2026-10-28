import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";

import { memberships, users } from "@/server/db/schema";
import type { TenantTransaction } from "@/server/db/tenant";

/**
 * Vétérinaires actifs du cabinet courant, par ordre alphabétique : responsable d'un suivi,
 * partage d'un dossier, garde, reprise des suivis d'un membre qui part.
 */
export function activeVets(
  tx: TenantTransaction,
  options: { excluding?: string } = {},
) {
  return tx
    .select({ membershipId: memberships.id, name: users.displayName })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        isNull(memberships.deactivatedAt),
        inArray(memberships.role, ["admin_vet", "vet"]),
        options.excluding === undefined
          ? undefined
          : ne(memberships.id, options.excluding),
      ),
    )
    .orderBy(asc(users.displayName));
}
