import { and, asc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";

import { DomainError } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import {
  animalOwners,
  animals,
  auditEvents,
  followupShares,
  followups,
  memberships,
  owners,
  protocolVersions,
  users,
} from "@/server/db/schema";
import type { AuditMetadata } from "@/domains/audit/schema";
import { withTenant } from "@/server/db/tenant";
import type { Database, TenantTransaction } from "@/server/db/tenant";

import { canManageFollowupAccess, followupAccess } from "./policies";

type Status = "draft" | "active" | "paused" | "human_takeover" | "ended";
type Triage = "normal" | "watch" | "urgent";

/** Ce que voit une personne autorisée « organisation seulement » : aucune donnée clinique. */
export type FollowupSummary = {
  access: "summary";
  id: string;
  animalName: string;
  species: "dog" | "cat";
  ownerName: string | null;
  status: Status;
  responsibleMembershipId: string;
  responsibleName: string;
  isPrivate: boolean;
  controlAppointmentAt: Date | null;
  startedAt: Date | null;
};

/** En plus, pour une personne autorisée aux données cliniques. */
export type FollowupClinical = Omit<FollowupSummary, "access"> & {
  access: "clinical";
  procedure: string;
  procedureAt: Date;
  triage: Triage;
  /** Version de protocole figée au lancement (null : suivi sans protocole). */
  protocol: { id: string; name: string; versionNumber: number } | null;
};

export type FollowupView = FollowupSummary | FollowupClinical;

export type FollowupShareView = {
  membershipId: string;
  name: string;
  expiresAt: Date | null;
};

type Row = {
  id: string;
  animalName: string;
  species: "dog" | "cat";
  status: Status;
  triage: Triage;
  procedure: string;
  procedureAt: Date;
  isPrivate: boolean;
  controlAppointmentAt: Date | null;
  startedAt: Date | null;
  responsibleMembershipId: string;
  responsibleName: string;
  protocolId: string | null;
  protocolName: string | null;
  protocolVersionNumber: number | null;
};

const idSchema = z.uuid();

/**
 * Construit la vue champ par champ (jamais par copie de la ligne) : un champ clinique
 * ajouté plus tard ne peut pas fuiter vers une vue « organisation seulement ».
 */
function toView(
  row: Row,
  ownerName: string | null,
  access: "summary" | "clinical",
): FollowupView {
  const summary: FollowupSummary = {
    access: "summary",
    id: row.id,
    animalName: row.animalName,
    species: row.species,
    ownerName,
    status: row.status,
    responsibleMembershipId: row.responsibleMembershipId,
    responsibleName: row.responsibleName,
    isPrivate: row.isPrivate,
    controlAppointmentAt: row.controlAppointmentAt,
    startedAt: row.startedAt,
  };
  if (access === "summary") return summary;
  return {
    ...summary,
    access: "clinical",
    procedure: row.procedure,
    procedureAt: row.procedureAt,
    triage: row.triage,
    protocol:
      row.protocolId && row.protocolName && row.protocolVersionNumber
        ? {
            id: row.protocolId,
            name: row.protocolName,
            versionNumber: row.protocolVersionNumber,
          }
        : null,
  };
}

function selectRows(tx: TenantTransaction) {
  return tx
    .select({
      id: followups.id,
      animalName: animals.name,
      species: animals.species,
      status: followups.status,
      triage: followups.triage,
      procedure: followups.procedure,
      procedureAt: followups.procedureAt,
      isPrivate: followups.isPrivate,
      controlAppointmentAt: followups.controlAppointmentAt,
      startedAt: followups.startedAt,
      responsibleMembershipId: followups.responsibleMembershipId,
      responsibleName: users.displayName,
      protocolId: protocolVersions.protocolId,
      protocolName: protocolVersions.name,
      protocolVersionNumber: protocolVersions.versionNumber,
    })
    .from(followups)
    .innerJoin(animals, eq(animals.id, followups.animalId))
    .innerJoin(
      memberships,
      eq(memberships.id, followups.responsibleMembershipId),
    )
    .innerJoin(users, eq(users.id, memberships.userId))
    .leftJoin(
      protocolVersions,
      eq(protocolVersions.id, followups.protocolVersionId),
    );
}

async function activeShares(tx: TenantTransaction, followupIds: string[]) {
  if (!followupIds.length) return new Map<string, FollowupShareView[]>();
  const rows = await tx
    .select({
      followupId: followupShares.followupId,
      membershipId: followupShares.membershipId,
      expiresAt: followupShares.expiresAt,
      name: users.displayName,
    })
    .from(followupShares)
    .innerJoin(memberships, eq(memberships.id, followupShares.membershipId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        inArray(followupShares.followupId, followupIds),
        isNull(followupShares.revokedAt),
        isNull(memberships.deactivatedAt),
        or(
          isNull(followupShares.expiresAt),
          gt(followupShares.expiresAt, new Date()),
        ),
      ),
    );
  const byFollowup = new Map<string, FollowupShareView[]>();
  for (const row of rows) {
    const list = byFollowup.get(row.followupId) ?? [];
    list.push({
      membershipId: row.membershipId,
      name: row.name,
      expiresAt: row.expiresAt,
    });
    byFollowup.set(row.followupId, list);
  }
  return byFollowup;
}

async function firstOwners(tx: TenantTransaction, animalIds: string[]) {
  if (!animalIds.length) return new Map<string, string>();
  const rows = await tx
    .select({ animalId: animalOwners.animalId, name: owners.fullName })
    .from(animalOwners)
    .innerJoin(owners, eq(owners.id, animalOwners.ownerId))
    .where(inArray(animalOwners.animalId, animalIds))
    .orderBy(asc(animalOwners.createdAt), asc(owners.fullName));
  const result = new Map<string, string>();
  for (const row of rows)
    if (!result.has(row.animalId)) result.set(row.animalId, row.name);
  return result;
}

async function audit(
  tx: TenantTransaction,
  actor: Actor,
  action: string,
  followupId: string,
  metadata: AuditMetadata = {},
) {
  await tx.insert(auditEvents).values({
    organizationId: actor.organizationId,
    actorMembershipId: actor.membershipId,
    action,
    targetType: "followup",
    targetId: followupId,
    metadata,
  });
}

export function followupsService(db: Database) {
  const run = <T>(actor: Actor, fn: (tx: TenantTransaction) => Promise<T>) =>
    withTenant(
      db,
      { organizationId: actor.organizationId, userId: actor.userId },
      fn,
    );

  /** Suivi et faits d'accès ; null si absent du cabinet. */
  async function load(tx: TenantTransaction, followupId: string) {
    const [row] = await selectRows(tx).where(eq(followups.id, followupId));
    if (!row) return null;
    const shares = (await activeShares(tx, [row.id])).get(row.id) ?? [];
    return { row, shares };
  }

  async function animalIdOf(tx: TenantTransaction, followupId: string) {
    const [row] = await tx
      .select({ animalId: followups.animalId })
      .from(followups)
      .where(eq(followups.id, followupId));
    return row?.animalId;
  }

  /** Vérifie que l'acteur est le vétérinaire responsable ; sinon le dossier « n'existe pas ». */
  async function loadManaged(
    tx: TenantTransaction,
    actor: Actor,
    followupId: string,
  ) {
    if (!idSchema.safeParse(followupId).success)
      throw new DomainError("not_found");
    const loaded = await load(tx, followupId);
    if (!loaded) throw new DomainError("not_found");
    const facts = {
      responsibleMembershipId: loaded.row.responsibleMembershipId,
      isPrivate: loaded.row.isPrivate,
      sharedWith: loaded.shares.map((share) => share.membershipId),
    };
    if (followupAccess(actor, facts) === "none")
      throw new DomainError("not_found");
    if (!canManageFollowupAccess(actor, facts))
      throw new DomainError("forbidden");
    return loaded;
  }

  return {
    /** Suivis visibles par l'acteur, chacun au niveau de détail autorisé. */
    async list(actor: Actor): Promise<FollowupView[]> {
      return run(actor, async (tx) => {
        const rows = await selectRows(tx).orderBy(asc(animals.name));
        const shares = await activeShares(
          tx,
          rows.map((row) => row.id),
        );
        const animalRows = await tx
          .select({ id: followups.id, animalId: followups.animalId })
          .from(followups);
        const animalOf = new Map(animalRows.map((r) => [r.id, r.animalId]));
        const ownerOf = await firstOwners(tx, [...new Set(animalOf.values())]);

        const views: FollowupView[] = [];
        for (const row of rows) {
          const access = followupAccess(actor, {
            responsibleMembershipId: row.responsibleMembershipId,
            isPrivate: row.isPrivate,
            sharedWith: (shares.get(row.id) ?? []).map((s) => s.membershipId),
          });
          if (access === "none") continue;
          const animalId = animalOf.get(row.id);
          views.push(
            toView(
              row,
              animalId ? (ownerOf.get(animalId) ?? null) : null,
              access,
            ),
          );
        }
        return views;
      });
    },

    /**
     * Dossier pour l'acteur, ou null (inexistant, autre cabinet ou non autorisé : même réponse).
     * Chaque consultation autorisée est journalisée, dans la même transaction.
     */
    async open(actor: Actor, followupId: string) {
      if (!idSchema.safeParse(followupId).success) return null;
      return run(actor, async (tx) => {
        const loaded = await load(tx, followupId);
        if (!loaded) return null;
        const facts = {
          responsibleMembershipId: loaded.row.responsibleMembershipId,
          isPrivate: loaded.row.isPrivate,
          sharedWith: loaded.shares.map((share) => share.membershipId),
        };
        const access = followupAccess(actor, facts);
        if (access === "none") return null;

        await audit(tx, actor, "followup.viewed", followupId, { access });
        const animalId = await animalIdOf(tx, followupId);
        const ownerName = animalId
          ? ((await firstOwners(tx, [animalId])).get(animalId) ?? null)
          : null;
        const canManage = canManageFollowupAccess(actor, facts);
        return {
          followup: toView(loaded.row, ownerName, access),
          canManageAccess: canManage,
          // La liste des partages n'est montrée qu'au responsable.
          shares: canManage ? loaded.shares : [],
        };
      });
    },

    /** Vétérinaires actifs à qui le responsable peut partager ce dossier. */
    async shareCandidates(actor: Actor, followupId: string) {
      return run(actor, async (tx) => {
        const loaded = await loadManaged(tx, actor, followupId);
        const shared = new Set(
          loaded.shares.map((share) => share.membershipId),
        );
        const rows = await tx
          .select({ membershipId: memberships.id, name: users.displayName })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(
            and(
              isNull(memberships.deactivatedAt),
              inArray(memberships.role, ["admin_vet", "vet"]),
            ),
          )
          .orderBy(asc(users.displayName));
        return rows.filter(
          (row) =>
            row.membershipId !== loaded.row.responsibleMembershipId &&
            !shared.has(row.membershipId),
        );
      });
    },

    async share(
      actor: Actor,
      followupId: string,
      input: { membershipId: string; expiresAt: Date | null },
    ) {
      await run(actor, async (tx) => {
        await loadManaged(tx, actor, followupId);
        if (!idSchema.safeParse(input.membershipId).success)
          throw new DomainError("invalid_target");
        const [target] = await tx
          .select({ role: memberships.role })
          .from(memberships)
          .where(
            and(
              eq(memberships.id, input.membershipId),
              isNull(memberships.deactivatedAt),
            ),
          );
        if (
          !target ||
          target.role === "assistant" ||
          input.membershipId === actor.membershipId
        )
          throw new DomainError("invalid_target");
        if (input.expiresAt && input.expiresAt.getTime() <= Date.now())
          throw new DomainError("invalid_target");

        await tx
          .insert(followupShares)
          .values({
            organizationId: actor.organizationId,
            followupId,
            membershipId: input.membershipId,
            grantedByMembershipId: actor.membershipId,
            expiresAt: input.expiresAt,
          })
          .onConflictDoUpdate({
            target: [followupShares.followupId, followupShares.membershipId],
            set: {
              grantedByMembershipId: actor.membershipId,
              expiresAt: input.expiresAt,
              revokedAt: null,
              createdAt: new Date(),
            },
          });
        await audit(tx, actor, "followup.shared", followupId, {
          membershipId: input.membershipId,
          expiresAt: input.expiresAt?.toISOString() ?? null,
        });
      });
    },

    async revokeShare(actor: Actor, followupId: string, membershipId: string) {
      await run(actor, async (tx) => {
        await loadManaged(tx, actor, followupId);
        if (!idSchema.safeParse(membershipId).success)
          throw new DomainError("invalid_target");
        const revoked = await tx
          .update(followupShares)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(followupShares.followupId, followupId),
              eq(followupShares.membershipId, membershipId),
              isNull(followupShares.revokedAt),
            ),
          )
          .returning({ membershipId: followupShares.membershipId });
        if (!revoked.length) throw new DomainError("invalid_target");
        await audit(tx, actor, "followup.unshared", followupId, {
          membershipId,
        });
      });
    },

    async setPrivate(actor: Actor, followupId: string, isPrivate: boolean) {
      await run(actor, async (tx) => {
        const loaded = await loadManaged(tx, actor, followupId);
        if (loaded.row.isPrivate === isPrivate) return;
        await tx
          .update(followups)
          .set({ isPrivate })
          .where(eq(followups.id, followupId));
        await audit(tx, actor, "followup.privacy_changed", followupId, {
          isPrivate,
        });
      });
    },
  };
}

export type FollowupsService = ReturnType<typeof followupsService>;
