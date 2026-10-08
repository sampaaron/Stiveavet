import { and, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { DomainError, assertPermission } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import { auditEvents, scheduledJobs } from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import type { Database, TenantTransaction } from "@/server/db/tenant";

import { jobErrorLabel, jobKindLabel } from "./kinds";

/**
 * Tâches en échec (architecture §9) : après la dernière tentative, une tâche est visible de
 * l'administrateur, qui la relance ou l'abandonne. Aucune donnée clinique n'est montrée :
 * type de tâche, dates, nombre de tentatives, motif technique et lien vers le dossier (qui
 * reste soumis aux droits du dossier).
 */

export type FailedJobView = {
  id: string;
  label: string;
  errorLabel: string;
  attempts: number;
  firstPlannedAt: Date;
  failedAt: Date;
  followupId: string | null;
};

const idSchema = z.uuid();

export function jobsService(db: Database) {
  const run = <T>(actor: Actor, fn: (tx: TenantTransaction) => Promise<T>) =>
    withTenant(
      db,
      { organizationId: actor.organizationId, userId: actor.userId },
      fn,
    );

  async function changeDeadJob(
    actor: Actor,
    jobId: string,
    change: "retry" | "cancel",
  ) {
    assertPermission(actor, "organization.settings");
    if (!idSchema.safeParse(jobId).success) throw new DomainError("not_found");
    await run(actor, async (tx) => {
      const values =
        change === "retry"
          ? {
              status: "pending" as const,
              attempts: 0,
              runAt: sql`now()`,
              finishedAt: null,
            }
          : { status: "cancelled" as const };
      const [job] = await tx
        .update(scheduledJobs)
        .set(values)
        .where(
          and(eq(scheduledJobs.id, jobId), eq(scheduledJobs.status, "dead")),
        )
        .returning({ id: scheduledJobs.id, kind: scheduledJobs.kind });
      if (!job) throw new DomainError("not_found");
      await tx.insert(auditEvents).values({
        organizationId: actor.organizationId,
        actorMembershipId: actor.membershipId,
        action: change === "retry" ? "job.retried" : "job.cancelled",
        targetType: "job",
        targetId: job.id,
        metadata: { kind: job.kind },
      });
    });
  }

  return {
    /** Nombre de tâches en échec, pour un signal discret dans la navigation. */
    async failureCount(actor: Actor): Promise<number> {
      if (!actor.permissions.has("organization.settings")) return 0;
      const [row] = await run(actor, (tx) =>
        tx
          .select({ n: count() })
          .from(scheduledJobs)
          .where(eq(scheduledJobs.status, "dead")),
      );
      return row?.n ?? 0;
    },

    async failures(actor: Actor): Promise<FailedJobView[]> {
      assertPermission(actor, "organization.settings");
      const rows = await run(actor, (tx) =>
        tx
          .select({
            id: scheduledJobs.id,
            kind: scheduledJobs.kind,
            errorCode: scheduledJobs.lastErrorCode,
            attempts: scheduledJobs.attempts,
            createdAt: scheduledJobs.createdAt,
            finishedAt: scheduledJobs.finishedAt,
            followupId: scheduledJobs.followupId,
          })
          .from(scheduledJobs)
          .where(eq(scheduledJobs.status, "dead"))
          .orderBy(desc(scheduledJobs.finishedAt))
          .limit(200),
      );
      return rows.map((row) => ({
        id: row.id,
        label: jobKindLabel(row.kind),
        errorLabel: jobErrorLabel(row.errorCode),
        attempts: row.attempts,
        firstPlannedAt: row.createdAt,
        failedAt: row.finishedAt ?? row.createdAt,
        followupId: row.followupId,
      }));
    },

    /** Nouvelle série de tentatives, tout de suite. */
    retry(actor: Actor, jobId: string) {
      return changeDeadJob(actor, jobId, "retry");
    },

    /** Abandon définitif : la tâche ne sera plus tentée. */
    cancel(actor: Actor, jobId: string) {
      return changeDeadJob(actor, jobId, "cancel");
    },
  };
}

export type JobsService = ReturnType<typeof jobsService>;
