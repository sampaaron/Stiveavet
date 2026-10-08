import { DEFAULT_LOCALE } from "@/i18n/locales";
import type { Locale } from "@/i18n/locales";
import { randomUUID } from "node:crypto";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  ne,
  sql,
} from "drizzle-orm";
import { z } from "zod";

import type { EmailSender } from "@/adapters/email/types";
import type { MemberRole } from "@/domains/auth/repository";
import {
  createToken,
  isWellFormedToken,
  tokenHash,
} from "@/domains/auth/tokens";
import {
  auditEvents,
  followupShares,
  followups,
  invitations,
  loginEvents,
  membershipPermissions,
  memberships,
  organizations,
  users,
} from "@/server/db/schema";
import type { AuditMetadata } from "@/domains/audit/schema";
import { vetLimit } from "@/domains/facturation/limits";
import { withTenant } from "@/server/db/tenant";
import type { Database, TenantTransaction } from "@/server/db/tenant";

import { DomainError, assertPermission } from "./actor";
import type { Actor } from "./actor";
import { invitationEmail } from "./emails";
import {
  PERMISSION_KEYS,
  ROLE_PERMISSIONS,
  VET_ROLES,
  isPermissionKey,
} from "./permissions";
import type { PermissionKey } from "./permissions";

export const INVITATION_DAYS = 7;

export type TeamMember = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
  active: boolean;
  activeFollowups: number;
  permissions: PermissionKey[];
  isSelf: boolean;
};

export type PendingInvitation = {
  id: string;
  email: string;
  displayName: string;
  role: MemberRole;
  expiresAt: Date;
};

const uuid = z.uuid();

function audit(
  tx: TenantTransaction,
  actor: Actor,
  action: string,
  target: { type: string; id: string },
  metadata: AuditMetadata = {},
) {
  return tx.insert(auditEvents).values({
    organizationId: actor.organizationId,
    actorMembershipId: actor.membershipId,
    action,
    targetType: target.type,
    targetId: target.id,
    metadata,
  });
}

/** Vétérinaires actifs et invitations de vétérinaires en attente (limite de 3 par cabinet). */
/** Places de vétérinaires occupées : membres actifs et, par défaut, invitations en attente. */
export async function vetSeats(tx: TenantTransaction, includePending = true) {
  const [active] = await tx
    .select({ n: count() })
    .from(memberships)
    .where(
      and(
        isNull(memberships.deactivatedAt),
        inArray(memberships.role, ["admin_vet", "vet"]),
      ),
    );
  if (!includePending) return active?.n ?? 0;
  const [pending] = await tx
    .select({ n: count() })
    .from(invitations)
    .where(
      and(
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, new Date()),
        inArray(invitations.role, ["admin_vet", "vet"]),
      ),
    );
  return (active?.n ?? 0) + (pending?.n ?? 0);
}

async function memberOf(tx: TenantTransaction, membershipId: string) {
  if (!uuid.safeParse(membershipId).success) throw new DomainError("not_found");
  const [member] = await tx
    .select({
      id: memberships.id,
      role: memberships.role,
      deactivatedAt: memberships.deactivatedAt,
      userId: memberships.userId,
    })
    .from(memberships)
    .where(eq(memberships.id, membershipId));
  if (!member) throw new DomainError("not_found");
  return member;
}

function translateDbError(error: unknown): never {
  const code =
    (error as { code?: string }).code ??
    (error as { cause?: { code?: string } }).cause?.code;
  const message =
    (error as { cause?: { message?: string } }).cause?.message ??
    (error as { message?: string }).message ??
    "";
  if (code === "23514" && message.includes("administrateur"))
    throw new DomainError("last_admin");
  if (code === "23514") throw new DomainError("permission_not_allowed");
  throw error;
}

export function teamService(deps: {
  db: Database;
  email: EmailSender;
  appUrl: string;
}) {
  const { db, email, appUrl } = deps;
  const run = <T>(actor: Actor, fn: (tx: TenantTransaction) => Promise<T>) =>
    withTenant(
      db,
      { organizationId: actor.organizationId, userId: actor.userId },
      fn,
    ).catch(translateDbError);

  return {
    async members(actor: Actor): Promise<TeamMember[]> {
      assertPermission(actor, "team.manage");
      return run(actor, async (tx) => {
        const rows = await tx
          .select({
            membershipId: memberships.id,
            userId: users.id,
            name: users.displayName,
            email: users.email,
            role: memberships.role,
            deactivatedAt: memberships.deactivatedAt,
          })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .orderBy(asc(memberships.deactivatedAt), asc(users.displayName));
        const permissionRows = await tx
          .select({
            membershipId: membershipPermissions.membershipId,
            permission: membershipPermissions.permission,
          })
          .from(membershipPermissions);
        const followupCounts = await tx
          .select({
            membershipId: followups.responsibleMembershipId,
            n: count(),
          })
          .from(followups)
          .where(ne(followups.status, "ended"))
          .groupBy(followups.responsibleMembershipId);
        const countOf = new Map(
          followupCounts.map((r) => [r.membershipId, r.n]),
        );

        return rows.map((row) => ({
          membershipId: row.membershipId,
          userId: row.userId,
          name: row.name,
          email: row.email,
          role: row.role,
          active: row.deactivatedAt === null,
          activeFollowups: countOf.get(row.membershipId) ?? 0,
          permissions: permissionRows
            .filter((p) => p.membershipId === row.membershipId)
            .map((p) => p.permission)
            .filter(isPermissionKey),
          isSelf: row.membershipId === actor.membershipId,
        }));
      });
    },

    /** Vétérinaires autorisés par la formule du cabinet. */
    async vetLimit(actor: Actor): Promise<number> {
      assertPermission(actor, "team.manage");
      return run(actor, (tx) => vetLimit(tx));
    },

    async pendingInvitations(actor: Actor): Promise<PendingInvitation[]> {
      assertPermission(actor, "team.manage");
      return run(actor, (tx) =>
        tx
          .select({
            id: invitations.id,
            email: invitations.email,
            displayName: invitations.displayName,
            role: invitations.role,
            expiresAt: invitations.expiresAt,
          })
          .from(invitations)
          .where(
            and(
              isNull(invitations.acceptedAt),
              isNull(invitations.revokedAt),
              gt(invitations.expiresAt, new Date()),
            ),
          )
          .orderBy(desc(invitations.createdAt)),
      );
    },

    /** Invitation par e-mail : lien valable 7 jours, à usage unique. */
    async invite(
      actor: Actor,
      input: { email: string; displayName: string; role: MemberRole },
    ) {
      assertPermission(actor, "team.manage");
      const address = input.email.trim().toLowerCase();
      const token = createToken();
      const organizationName = await run(actor, async (tx) => {
        const [existing] = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(
            and(eq(users.email, address), isNull(memberships.deactivatedAt)),
          );
        if (existing) throw new DomainError("already_member");
        if (
          VET_ROLES.has(input.role) &&
          (await vetSeats(tx)) >= (await vetLimit(tx))
        )
          throw new DomainError("vet_limit");

        const id = randomUUID();
        try {
          await tx.insert(invitations).values({
            id,
            organizationId: actor.organizationId,
            email: address,
            displayName: input.displayName.trim(),
            role: input.role,
            tokenHash: tokenHash(token),
            invitedByMembershipId: actor.membershipId,
            expiresAt: new Date(Date.now() + INVITATION_DAYS * 24 * 3600_000),
          });
        } catch (error) {
          const code =
            (error as { code?: string }).code ??
            (error as { cause?: { code?: string } }).cause?.code;
          if (code === "23505") throw new DomainError("already_invited");
          throw error;
        }
        await audit(
          tx,
          actor,
          "invitation.created",
          { type: "invitation", id },
          {
            role: input.role,
          },
        );
        const [organization] = await tx
          .select({ name: organizations.name })
          .from(organizations);
        return organization?.name ?? "votre cabinet";
      });

      const url = new URL("/invitation", appUrl);
      url.searchParams.set("jeton", token);
      await email.send(
        invitationEmail(address, {
          organizationName,
          displayName: input.displayName.trim(),
          url: url.toString(),
          days: INVITATION_DAYS,
        }),
      );
    },

    async revokeInvitation(actor: Actor, invitationId: string) {
      assertPermission(actor, "team.manage");
      if (!uuid.safeParse(invitationId).success)
        throw new DomainError("not_found");
      await run(actor, async (tx) => {
        const revoked = await tx
          .update(invitations)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(invitations.id, invitationId),
              isNull(invitations.acceptedAt),
              isNull(invitations.revokedAt),
            ),
          )
          .returning({ id: invitations.id });
        if (!revoked.length) throw new DomainError("not_found");
        await audit(tx, actor, "invitation.revoked", {
          type: "invitation",
          id: invitationId,
        });
      });
    },

    /**
     * Permissions d'un vétérinaire ou d'un assistant, dans la limite autorisée pour son rôle.
     * Celles d'un administrateur sont complètes et ne se modifient pas.
     */
    async setPermissions(
      actor: Actor,
      membershipId: string,
      requested: string[],
    ) {
      assertPermission(actor, "team.manage");
      const wanted = new Set(requested.filter(isPermissionKey));
      await run(actor, async (tx) => {
        const member = await memberOf(tx, membershipId);
        if (member.id === actor.membershipId)
          throw new DomainError("self_action");
        if (member.role === "admin_vet") throw new DomainError("forbidden");
        const grants = ROLE_PERMISSIONS[member.role];
        const allowed = new Set([...grants.defaults, ...grants.optional]);
        if ([...wanted].some((key) => !allowed.has(key)))
          throw new DomainError("permission_not_allowed");

        const current = new Set(
          (
            await tx
              .select({ permission: membershipPermissions.permission })
              .from(membershipPermissions)
              .where(eq(membershipPermissions.membershipId, membershipId))
          ).map((row) => row.permission),
        );
        const added = PERMISSION_KEYS.filter(
          (k) => wanted.has(k) && !current.has(k),
        );
        const removed = PERMISSION_KEYS.filter(
          (k) => !wanted.has(k) && current.has(k),
        );
        if (!added.length && !removed.length) return;

        if (removed.length)
          await tx
            .delete(membershipPermissions)
            .where(
              and(
                eq(membershipPermissions.membershipId, membershipId),
                inArray(membershipPermissions.permission, removed),
              ),
            );
        if (added.length)
          await tx.insert(membershipPermissions).values(
            added.map((permission) => ({
              organizationId: actor.organizationId,
              membershipId,
              permission,
              grantedByMembershipId: actor.membershipId,
            })),
          );
        await audit(
          tx,
          actor,
          "membership.permissions_changed",
          { type: "membership", id: membershipId },
          { added, removed },
        );
      });
    },

    /** Nouveau rôle : permissions remises aux valeurs par défaut du rôle (déclencheur en base). */
    async changeRole(actor: Actor, membershipId: string, role: MemberRole) {
      assertPermission(actor, "team.manage");
      await run(actor, async (tx) => {
        const member = await memberOf(tx, membershipId);
        if (member.id === actor.membershipId)
          throw new DomainError("self_action");
        if (member.deactivatedAt) throw new DomainError("invalid_target");
        if (member.role === role) return;
        if (
          VET_ROLES.has(role) &&
          !VET_ROLES.has(member.role) &&
          (await vetSeats(tx)) >= (await vetLimit(tx))
        )
          throw new DomainError("vet_limit");
        // Un assistant ne peut pas rester responsable de suivis.
        if (role === "assistant") {
          const [open] = await tx
            .select({ n: count() })
            .from(followups)
            .where(
              and(
                eq(followups.responsibleMembershipId, membershipId),
                ne(followups.status, "ended"),
              ),
            );
          if ((open?.n ?? 0) > 0)
            throw new DomainError("reassignment_required");
        }
        await tx
          .update(memberships)
          .set({ role })
          .where(eq(memberships.id, membershipId));
        await audit(
          tx,
          actor,
          "membership.role_changed",
          { type: "membership", id: membershipId },
          { from: member.role, to: role },
        );
      });
    },

    /**
     * Départ d'un membre : ses suivis en cours passent au vétérinaire choisi, ses partages
     * sont retirés, et sa session tombe immédiatement (contrôle à chaque requête).
     */
    async deactivate(
      actor: Actor,
      membershipId: string,
      reassignTo: string | null,
    ) {
      assertPermission(actor, "team.manage");
      await run(actor, async (tx) => {
        const member = await memberOf(tx, membershipId);
        if (member.id === actor.membershipId)
          throw new DomainError("self_action");
        if (member.deactivatedAt) return;

        const open = await tx
          .select({ id: followups.id })
          .from(followups)
          .where(
            and(
              eq(followups.responsibleMembershipId, membershipId),
              ne(followups.status, "ended"),
            ),
          );
        if (open.length) {
          if (!reassignTo) throw new DomainError("reassignment_required");
          const target = await memberOf(tx, reassignTo);
          if (
            target.id === membershipId ||
            target.deactivatedAt ||
            !VET_ROLES.has(target.role)
          )
            throw new DomainError("invalid_target");
          await tx
            .update(followups)
            .set({ responsibleMembershipId: target.id })
            .where(
              inArray(
                followups.id,
                open.map((f) => f.id),
              ),
            );
          // Le nouveau responsable n'a plus besoin d'un partage sur ces dossiers.
          await tx
            .update(followupShares)
            .set({ revokedAt: new Date() })
            .where(
              and(
                inArray(
                  followupShares.followupId,
                  open.map((f) => f.id),
                ),
                eq(followupShares.membershipId, target.id),
                isNull(followupShares.revokedAt),
              ),
            );
          for (const followup of open)
            await audit(
              tx,
              actor,
              "followup.reassigned",
              { type: "followup", id: followup.id },
              {
                from: membershipId,
                to: target.id,
                reason: "member_deactivated",
              },
            );
        }

        await tx
          .update(followupShares)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(followupShares.membershipId, membershipId),
              isNull(followupShares.revokedAt),
            ),
          );
        await tx
          .update(memberships)
          .set({ deactivatedAt: new Date() })
          .where(eq(memberships.id, membershipId));
        await audit(
          tx,
          actor,
          "membership.deactivated",
          { type: "membership", id: membershipId },
          { reassignedFollowups: open.length },
        );
      });
    },

    async reactivate(actor: Actor, membershipId: string) {
      assertPermission(actor, "team.manage");
      await run(actor, async (tx) => {
        const member = await memberOf(tx, membershipId);
        if (!member.deactivatedAt) return;
        if (
          VET_ROLES.has(member.role) &&
          (await vetSeats(tx)) >= (await vetLimit(tx))
        )
          throw new DomainError("vet_limit");
        await tx
          .update(memberships)
          .set({ deactivatedAt: null })
          .where(eq(memberships.id, membershipId));
        await audit(tx, actor, "membership.reactivated", {
          type: "membership",
          id: membershipId,
        });
      });
    },

    /** Journal d'activité : actions (audit) et connexions, les plus récentes d'abord. */
    async activity(actor: Actor, limit = 100) {
      assertPermission(actor, "activity_log.read");
      return run(actor, async (tx) => {
        const names = new Map(
          (
            await tx
              .select({
                membershipId: memberships.id,
                userId: users.id,
                name: users.displayName,
              })
              .from(memberships)
              .innerJoin(users, eq(users.id, memberships.userId))
          ).flatMap((row) => [
            [row.membershipId, row.name],
            [row.userId, row.name],
          ]),
        );
        const actions = await tx
          .select({
            id: auditEvents.id,
            action: auditEvents.action,
            actorMembershipId: auditEvents.actorMembershipId,
            targetType: auditEvents.targetType,
            targetId: auditEvents.targetId,
            metadata: auditEvents.metadata,
            occurredAt: auditEvents.occurredAt,
          })
          .from(auditEvents)
          .orderBy(desc(auditEvents.occurredAt))
          .limit(limit);
        const logins = await tx
          .select({
            id: loginEvents.id,
            kind: loginEvents.kind,
            userId: loginEvents.userId,
            occurredAt: loginEvents.occurredAt,
          })
          .from(loginEvents)
          .orderBy(desc(loginEvents.occurredAt))
          .limit(limit);
        // Noms bruts : `null` quand l'auteur n'existe plus ou n'est pas un membre (système,
        // connexion d'une adresse inconnue) ; l'écran le dit dans la langue de la personne.
        return {
          actions: actions.map((event) => ({
            ...event,
            actorName: event.actorMembershipId
              ? (names.get(event.actorMembershipId) ?? null)
              : null,
            targetName:
              event.targetType === "membership" && event.targetId
                ? (names.get(event.targetId) ?? null)
                : null,
          })),
          logins: logins.map((event) => ({
            ...event,
            userName: event.userId ? (names.get(event.userId) ?? null) : null,
          })),
        };
      });
    },

    /** Vétérinaires actifs pouvant reprendre les suivis d'un membre qui part. */
    async reassignmentTargets(actor: Actor, excludingMembershipId: string) {
      assertPermission(actor, "team.manage");
      return run(actor, (tx) =>
        tx
          .select({ membershipId: memberships.id, name: users.displayName })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(
            and(
              isNull(memberships.deactivatedAt),
              inArray(memberships.role, ["admin_vet", "vet"]),
              ne(memberships.id, excludingMembershipId),
            ),
          )
          .orderBy(asc(users.displayName)),
      );
    },
  };
}

export type TeamService = ReturnType<typeof teamService>;

// Acceptation d'une invitation (sans session) ------------------------------------

export type InvitationPreview = {
  organizationName: string;
  email: string;
  displayName: string;
  role: MemberRole;
  emailRegistered: boolean;
};

async function invitationForToken(db: Database, token: string) {
  const result = await db.execute(
    sql`SELECT * FROM auth.invitation_for_token(${tokenHash(token)})`,
  );
  const row = result.rows[0] as
    | {
        invitation_id: string;
        organization_id: string;
        organization_name: string;
        email: string;
        display_name: string;
        role: MemberRole;
        email_registered: boolean;
      }
    | undefined;
  return row ?? null;
}

export async function previewInvitation(
  db: Database,
  token: string | undefined,
): Promise<InvitationPreview | null> {
  if (!isWellFormedToken(token)) return null;
  const row = await invitationForToken(db, token);
  return row
    ? {
        organizationName: row.organization_name,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        emailRegistered: row.email_registered,
      }
    : null;
}

/**
 * Crée le compte de la personne invitée et son appartenance au cabinet. L'invitation est
 * consommée dans la même transaction ; la limite de vétérinaires est revérifiée.
 */
export async function acceptInvitation(
  db: Database,
  input: {
    token: string | undefined;
    displayName: string;
    passwordHash: string;
    /** Langue de la page d'invitation, gardée pour l'interface (ADR 0022). */
    uiLocale?: Locale;
  },
): Promise<"accepted" | "expired" | "email_registered" | "vet_limit"> {
  if (!isWellFormedToken(input.token)) return "expired";
  const token = input.token;
  const invitation = await invitationForToken(db, token);
  if (!invitation) return "expired";
  if (invitation.email_registered) return "email_registered";

  const userId = randomUUID();
  const membershipId = randomUUID();
  try {
    return await withTenant(
      db,
      { organizationId: invitation.organization_id, userId },
      async (tx) => {
        const consumed = await tx
          .update(invitations)
          .set({ acceptedAt: new Date() })
          .where(
            and(
              eq(invitations.id, invitation.invitation_id),
              eq(invitations.tokenHash, tokenHash(token)),
              isNull(invitations.acceptedAt),
              isNull(invitations.revokedAt),
              gt(invitations.expiresAt, new Date()),
            ),
          )
          .returning({ invitedBy: invitations.invitedByMembershipId });
        const invitedBy = consumed[0]?.invitedBy;
        if (!invitedBy) return "expired" as const;
        if (
          VET_ROLES.has(invitation.role) &&
          (await vetSeats(tx, false)) >= (await vetLimit(tx))
        )
          throw new DomainError("vet_limit");

        await tx.insert(users).values({
          id: userId,
          email: invitation.email,
          displayName: input.displayName.trim() || invitation.display_name,
          uiLocale: input.uiLocale ?? DEFAULT_LOCALE,
        });
        await tx.insert(memberships).values({
          id: membershipId,
          organizationId: invitation.organization_id,
          userId,
          role: invitation.role,
        });
        await tx.execute(
          sql`SELECT auth.set_initial_password(${userId}, ${input.passwordHash})`,
        );
        await tx.insert(auditEvents).values({
          organizationId: invitation.organization_id,
          actorMembershipId: invitedBy,
          action: "membership.created",
          targetType: "membership",
          targetId: membershipId,
          metadata: { role: invitation.role, source: "invitation" },
        });
        return "accepted" as const;
      },
    );
  } catch (error) {
    if (error instanceof DomainError && error.code === "vet_limit")
      return "vet_limit";
    const code =
      (error as { code?: string }).code ??
      (error as { cause?: { code?: string } }).cause?.code;
    if (code === "23505") return "email_registered";
    throw error;
  }
}
