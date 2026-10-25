import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { appDatabase } from "@/server/db/client";
import { loginEvents, memberships, users } from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";

type Who = { organizationId: string; userId: string; membershipId: string };

/** Nombre de connexions récentes montrées sur la page « Mon compte ». */
export const ACCOUNT_LOGIN_HISTORY = 10;

/**
 * Données personnelles de la personne connectée, pour elle seule : identité, adhésion au
 * cabinet et dernières connexions. Lu sous RLS et filtré sur son propre identifiant ; aucune
 * donnée d'un autre membre n'est lue ici.
 */
export async function memberAccount(session: Who) {
  return withTenant(
    appDatabase(),
    { organizationId: session.organizationId, userId: session.userId },
    async (tx) => {
      const [user] = await tx
        .select({
          email: users.email,
          displayName: users.displayName,
          uiLocale: users.uiLocale,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, session.userId));
      const [membership] = await tx
        .select({
          alertPhone: memberships.alertPhone,
          joinedAt: memberships.createdAt,
        })
        .from(memberships)
        .where(eq(memberships.id, session.membershipId));
      if (!user || !membership) throw new Error("Compte introuvable");
      const logins = await tx
        .select({
          kind: loginEvents.kind,
          userAgent: loginEvents.userAgent,
          occurredAt: loginEvents.occurredAt,
        })
        .from(loginEvents)
        .where(
          and(
            eq(loginEvents.userId, session.userId),
            eq(loginEvents.organizationId, session.organizationId),
          ),
        )
        .orderBy(desc(loginEvents.occurredAt))
        .limit(ACCOUNT_LOGIN_HISTORY);
      return { ...user, ...membership, logins };
    },
  );
}
