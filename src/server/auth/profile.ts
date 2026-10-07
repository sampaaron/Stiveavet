import "server-only";

import { eq } from "drizzle-orm";
import { cache } from "react";

import type { MemberRole, ResolvedSession } from "@/domains/auth/repository";
import { appDatabase } from "@/server/db/client";
import { organizations, users } from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";

const roleLabels: Record<MemberRole, string> = {
  admin_vet: "Vétérinaire administrateur",
  vet: "Vétérinaire",
  assistant: "Assistant vétérinaire",
};

/** Nom affiché, rôle et cabinet de la personne connectée (lu sous RLS). */
export const memberProfile = cache(async (session: ResolvedSession) =>
  withTenant(
    appDatabase(),
    { organizationId: session.organizationId, userId: session.userId },
    async (tx) => {
      const [user] = await tx
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, session.userId));
      const [organization] = await tx
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, session.organizationId));
      if (!user || !organization) throw new Error("Profil introuvable");
      return {
        displayName: user.displayName,
        firstName: firstName(user.displayName),
        organizationName: organization.name,
        roleLabel: roleLabels[session.role],
      };
    },
  ),
);

function firstName(displayName: string): string {
  const parts = displayName.split(/\s+/).filter((part) => part !== "Dr");
  return parts[0] ?? displayName;
}
