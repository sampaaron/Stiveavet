import { and, asc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { DomainError } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import {
  animalOwners,
  animals,
  followupShares,
  followups,
  memberships,
  owners,
  protocolVersions,
  users,
} from "@/server/db/schema";
import { tenantRunner, uuidArray } from "@/server/db/tenant";
import type { Database, TenantTransaction } from "@/server/db/tenant";
import { auditFollowup as audit } from "@/domains/audit/journal";

import { canManageFollowupAccess, followupAccess } from "./policies";
import type { FollowupAccess, Viewer } from "./policies";
import { loadFollowupRecord } from "./record";
import { activeVets } from "@/domains/equipe/veterinaires";

export type FollowupStatus =
  "draft" | "active" | "paused" | "human_takeover" | "ended";
type Status = FollowupStatus;
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
  /** Suivi test de l'installation : jamais compté, facturé ni envoyé. */
  isTest: boolean;
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
  animalId: string;
  animalName: string;
  species: "dog" | "cat";
  status: Status;
  triage: Triage;
  procedure: string;
  procedureAt: Date;
  isPrivate: boolean;
  isTest: boolean;
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
    isTest: row.isTest,
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
      animalId: followups.animalId,
      animalName: animals.name,
      species: animals.species,
      status: followups.status,
      triage: followups.triage,
      procedure: followups.procedure,
      procedureAt: followups.procedureAt,
      isPrivate: followups.isPrivate,
      isTest: followups.isTest,
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
        sql`${followupShares.followupId} = ANY(${uuidArray(followupIds)})`,
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

/** Accès de l'acteur à chacun de ces suivis (historique d'un animal, registre). */
export async function followupAccessMap(
  tx: TenantTransaction,
  viewer: Viewer,
  rows: readonly {
    id: string;
    responsibleMembershipId: string;
    isPrivate: boolean;
  }[],
): Promise<Map<string, FollowupAccess>> {
  const shares = await activeShares(
    tx,
    rows.map((row) => row.id),
  );
  return new Map(
    rows.map((row) => [
      row.id,
      followupAccess(viewer, {
        responsibleMembershipId: row.responsibleMembershipId,
        isPrivate: row.isPrivate,
        sharedWith: (shares.get(row.id) ?? []).map((s) => s.membershipId),
      }),
    ]),
  );
}

async function firstOwners(tx: TenantTransaction, animalIds: string[]) {
  if (!animalIds.length) return new Map<string, string>();
  const rows = await tx
    .select({ animalId: animalOwners.animalId, name: owners.fullName })
    .from(animalOwners)
    .innerJoin(owners, eq(owners.id, animalOwners.ownerId))
    .where(sql`${animalOwners.animalId} = ANY(${uuidArray(animalIds)})`)
    .orderBy(asc(animalOwners.createdAt), asc(owners.fullName));
  const result = new Map<string, string>();
  for (const row of rows)
    if (!result.has(row.animalId)) result.set(row.animalId, row.name);
  return result;
}

export function followupsService(db: Database) {
  const run = tenantRunner(db);

  /** Suivi et faits d'accès ; null si absent du cabinet. */
  async function load(tx: TenantTransaction, followupId: string) {
    const [row] = await selectRows(tx).where(eq(followups.id, followupId));
    if (!row) return null;
    const shares = (await activeShares(tx, [row.id])).get(row.id) ?? [];
    return { row, shares };
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

  /** Vues des suivis lus, au niveau de détail autorisé ; ceux que l'acteur ne voit pas sont omis. */
  async function viewsOf(
    tx: TenantTransaction,
    actor: Actor,
    rows: readonly Row[],
  ): Promise<FollowupView[]> {
    const shares = await activeShares(
      tx,
      rows.map((row) => row.id),
    );
    const visible = rows.flatMap((row) => {
      const access = followupAccess(actor, {
        responsibleMembershipId: row.responsibleMembershipId,
        isPrivate: row.isPrivate,
        sharedWith: (shares.get(row.id) ?? []).map((s) => s.membershipId),
      });
      return access === "none" ? [] : [{ row, access }];
    });
    const ownerOf = await firstOwners(tx, [
      ...new Set(visible.map(({ row }) => row.animalId)),
    ]);
    return visible.map(({ row, access }) =>
      toView(row, ownerOf.get(row.animalId) ?? null, access),
    );
  }

  return {
    /**
     * Suivis visibles par l'acteur, chacun au niveau de détail autorisé. `statuses` filtre
     * dans la base : le tableau de bord ne relit pas l'historique des suivis terminés.
     */
    async list(
      actor: Actor,
      options: { statuses?: readonly Status[] } = {},
    ): Promise<FollowupView[]> {
      return run(actor, async (tx) => {
        const rows = await selectRows(tx)
          .where(
            options.statuses
              ? inArray(followups.status, [...options.statuses])
              : undefined,
          )
          .orderBy(asc(animals.name));
        return viewsOf(tx, actor, rows);
      });
    },

    /** Un suivi visible par l'acteur, sans journal de consultation ; null sinon. */
    async find(actor: Actor, followupId: string): Promise<FollowupView | null> {
      if (!idSchema.safeParse(followupId).success) return null;
      return run(actor, async (tx) => {
        const rows = await selectRows(tx).where(eq(followups.id, followupId));
        return (await viewsOf(tx, actor, rows))[0] ?? null;
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
        const { animalId } = loaded.row;
        const ownerName =
          (await firstOwners(tx, [animalId])).get(animalId) ?? null;
        const canManage = canManageFollowupAccess(actor, facts);
        return {
          followup: toView(loaded.row, ownerName, access),
          // Contacts pour tous ; conversation, triage et alertes avec `clinical.read` seulement.
          record: await loadFollowupRecord(tx, followupId, access),
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
        const rows = await activeVets(tx);
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
