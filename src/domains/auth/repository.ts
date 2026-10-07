import { sql } from "drizzle-orm";

import type { Database } from "@/server/db/tenant";

import type { loginEventKind } from "./schema";

/**
 * Accès au schéma `auth` : uniquement par ses fonctions SECURITY DEFINER (migration 0002).
 * Le rôle applicatif n'a aucun droit direct sur les tables d'authentification.
 */

export type MemberRole = "admin_vet" | "vet" | "assistant";

export type LoginEventKind = (typeof loginEventKind.enumValues)[number];

export type ResolvedSession = {
  sessionId: string;
  userId: string;
  organizationId: string;
  membershipId: string;
  role: MemberRole;
  locked: boolean;
};

const minutes = (value: number) => `${value} minutes`;

async function rows<T>(db: Database, query: ReturnType<typeof sql>) {
  const result = await db.execute(query);
  return result.rows as T[];
}

export function authRepository(db: Database) {
  return {
    async credentialsByEmail(email: string) {
      const [row] = await rows<{ user_id: string; password_hash: string }>(
        db,
        sql`SELECT * FROM auth.credentials_by_email(${email})`,
      );
      return row
        ? { userId: row.user_id, passwordHash: row.password_hash }
        : null;
    },

    async emailRegistered(email: string) {
      const [row] = await rows<{ registered: boolean }>(
        db,
        sql`SELECT auth.email_registered(${email}) AS registered`,
      );
      return row?.registered === true;
    },

    async passwordHashFor(userId: string) {
      const [row] = await rows<{ hash: string | null }>(
        db,
        sql`SELECT auth.password_hash_for(${userId}) AS hash`,
      );
      return row?.hash ?? null;
    },

    async activeMemberships(userId: string) {
      const result = await rows<{
        membership_id: string;
        organization_id: string;
        role: MemberRole;
      }>(db, sql`SELECT * FROM auth.active_memberships(${userId})`);
      return result.map((row) => ({
        membershipId: row.membership_id,
        organizationId: row.organization_id,
        role: row.role,
      }));
    },

    async createSession(
      hash: Buffer,
      userId: string,
      membershipId: string,
      lifetimeMinutes: number,
    ) {
      await db.execute(
        sql`SELECT auth.create_session(${hash}, ${userId}, ${membershipId}, ${minutes(lifetimeMinutes)}::interval)`,
      );
    },

    async resolveSession(
      hash: Buffer,
      idleMinutes: number,
    ): Promise<ResolvedSession | null> {
      const [row] = await rows<{
        session_id: string;
        user_id: string;
        organization_id: string;
        membership_id: string;
        role: MemberRole;
        locked: boolean;
      }>(
        db,
        sql`SELECT * FROM auth.resolve_session(${hash}, ${minutes(idleMinutes)}::interval)`,
      );
      return row
        ? {
            sessionId: row.session_id,
            userId: row.user_id,
            organizationId: row.organization_id,
            membershipId: row.membership_id,
            role: row.role,
            locked: row.locked,
          }
        : null;
    },

    async lockSession(hash: Buffer) {
      await db.execute(sql`SELECT auth.lock_session(${hash})`);
    },

    async unlockSession(hash: Buffer) {
      await db.execute(sql`SELECT auth.unlock_session(${hash})`);
    },

    async revokeSession(hash: Buffer) {
      await db.execute(sql`SELECT auth.revoke_session(${hash})`);
    },

    async createLoginChallenge(
      hash: Buffer,
      userId: string,
      codeHash: Buffer,
      lifetimeMinutes: number,
    ) {
      await db.execute(
        sql`SELECT auth.create_login_challenge(${hash}, ${userId}, ${codeHash}, ${minutes(lifetimeMinutes)}::interval)`,
      );
    },

    async verifyLoginChallenge(
      hash: Buffer,
      codeHash: Buffer,
      maxAttempts: number,
    ) {
      const [row] = await rows<{
        outcome: "ok" | "invalid" | "expired";
        user_id: string | null;
      }>(
        db,
        sql`SELECT * FROM auth.verify_login_challenge(${hash}, ${codeHash}, ${maxAttempts})`,
      );
      return {
        outcome: row?.outcome ?? "expired",
        userId: row?.user_id ?? null,
      };
    },

    async trustDevice(hash: Buffer, userId: string, lifetimeDays: number) {
      await db.execute(
        sql`SELECT auth.trust_device(${hash}, ${userId}, ${`${lifetimeDays} days`}::interval)`,
      );
    },

    async isTrustedDevice(hash: Buffer, userId: string) {
      const [row] = await rows<{ trusted: boolean }>(
        db,
        sql`SELECT auth.is_trusted_device(${hash}, ${userId}) AS trusted`,
      );
      return row?.trusted === true;
    },

    async createPasswordReset(
      hash: Buffer,
      userId: string,
      lifetimeMinutes: number,
    ) {
      await db.execute(
        sql`SELECT auth.create_password_reset(${hash}, ${userId}, ${minutes(lifetimeMinutes)}::interval)`,
      );
    },

    async passwordResetValid(hash: Buffer) {
      const [row] = await rows<{ valid: boolean }>(
        db,
        sql`SELECT auth.password_reset_valid(${hash}) AS valid`,
      );
      return row?.valid === true;
    },

    async resetPassword(hash: Buffer, passwordHash: string) {
      const [row] = await rows<{ user_id: string; email: string }>(
        db,
        sql`SELECT * FROM auth.reset_password(${hash}, ${passwordHash})`,
      );
      return row ? { userId: row.user_id, email: row.email } : null;
    },

    async hitRateLimit(bucket: string, windowMinutes: number, max: number) {
      const [row] = await rows<{ allowed: boolean }>(
        db,
        sql`SELECT auth.hit_rate_limit(${bucket}, ${minutes(windowMinutes)}::interval, ${max}) AS allowed`,
      );
      return row?.allowed === true;
    },

    async rateLimitReached(bucket: string, windowMinutes: number, max: number) {
      const [row] = await rows<{ reached: boolean }>(
        db,
        sql`SELECT auth.rate_limit_reached(${bucket}, ${minutes(windowMinutes)}::interval, ${max}) AS reached`,
      );
      return row?.reached === true;
    },

    async recordLoginEvent(event: {
      kind: LoginEventKind;
      userId?: string | null;
      organizationId?: string | null;
      ipHash?: string | null;
      userAgent?: string | null;
    }) {
      await db.execute(
        sql`SELECT auth.record_login_event(${event.kind}::login_event_kind, ${event.userId ?? null}, ${event.organizationId ?? null}, ${event.ipHash ?? null}, ${event.userAgent ?? null})`,
      );
    },
  };
}

export type AuthRepository = ReturnType<typeof authRepository>;
