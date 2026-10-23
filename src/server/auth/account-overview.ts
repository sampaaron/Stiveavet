import "server-only";

import { and, count, eq } from "drizzle-orm";

import { planDefinition } from "@/domains/facturation/rules";
import { parisMonth } from "@/domains/stive/service";
import type { Actor } from "@/domains/commun/actor";
import type { Plan } from "@/domains/facturation/rules";
import { appDatabase } from "@/server/db/client";
import {
  followups,
  memberships,
  organizations,
  stiveUsage,
  users,
} from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import type { Database } from "@/server/db/tenant";

type FollowupStatus = (typeof followups.status.enumValues)[number];

export type AccountOverview = {
  displayName: string;
  email: string;
  organizationName: string;
  language: "fr" | "en";
  memberSince: Date;
  /** Numéro WhatsApp professionnel des alertes urgentes, s'il est renseigné. */
  alertPhone: string | null;
  /** Suivis dont la personne est responsable, hors suivis test, par statut. */
  followups: Record<FollowupStatus, number>;
  /** Demandes à Stive ce mois-ci ; null si Stive n'est pas ouvert à la personne. */
  stive: { used: number; limit: number } | null;
};

/**
 * Tout ce que « Mon compte » montre, lu sous RLS pour la seule personne connectée : son
 * identité, son cabinet, ses suivis et son usage de Stive. Aucun contenu clinique.
 */
export async function accountOverview(
  context: Actor & { plan: Plan | null },
  { db = appDatabase(), now = new Date() }: { db?: Database; now?: Date } = {},
): Promise<AccountOverview> {
  return withTenant(
    db,
    { organizationId: context.organizationId, userId: context.userId },
    async (tx) => {
      const [person] = await tx
        .select({
          displayName: users.displayName,
          email: users.email,
          language: users.uiLocale,
          memberSince: memberships.createdAt,
          alertPhone: memberships.alertPhone,
          organizationName: organizations.name,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .innerJoin(
          organizations,
          eq(organizations.id, memberships.organizationId),
        )
        .where(eq(memberships.id, context.membershipId));
      if (!person) throw new Error("Compte introuvable");

      const byStatus = await tx
        .select({ status: followups.status, total: count() })
        .from(followups)
        .where(
          and(
            eq(followups.responsibleMembershipId, context.membershipId),
            eq(followups.isTest, false),
          ),
        )
        .groupBy(followups.status);
      const counts = Object.fromEntries(
        followups.status.enumValues.map((status) => [status, 0]),
      ) as Record<FollowupStatus, number>;
      for (const row of byStatus) counts[row.status] = row.total;

      let stive: AccountOverview["stive"] = null;
      if (context.permissions.has("stive.use")) {
        const [usage] = await tx
          .select({ requests: stiveUsage.requests })
          .from(stiveUsage)
          .where(
            and(
              eq(stiveUsage.membershipId, context.membershipId),
              eq(stiveUsage.month, parisMonth(now)),
            ),
          );
        stive = {
          used: usage?.requests ?? 0,
          limit: planDefinition(context.plan).stiveMonthlyRequests,
        };
      }

      return { ...person, followups: counts, stive };
    },
  );
}
