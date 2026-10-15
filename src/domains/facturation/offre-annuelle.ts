import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import type { EmailSender } from "@/adapters/email/types";
import { JobError } from "@/domains/taches/kinds";
import { enqueue } from "@/domains/taches/queue";
import type { JobHandler } from "@/domains/taches/worker";
import {
  auditEvents,
  membershipPermissions,
  memberships,
  organizations,
  subscriptions,
  users,
} from "@/server/db/schema";
import type { TenantTransaction } from "@/server/db/tenant";
import { formatDate } from "@/ui/format";

import { annualOfferEmail } from "./emails";
import {
  ANNUAL_REMINDER_MONTH,
  COMMITMENT_DECISION_MONTH,
  PLAN_CATALOG,
  annualOfferOpensAt,
  annualStartsAt,
  billingPeriod,
  commitmentReminder,
  formatEuros,
} from "./rules";
import type { SubscriptionFacts } from "./rules";

/**
 * Offre d'engagement annuel par e-mail (ADR 0023) : à 45 jours d'essai, puis rappel au début
 * du 6e mois. Les deux tâches sont inscrites à la création de l'abonnement ; chacune ne
 * fait rien si, à son heure, le choix n'est plus à faire (engagement pris, résiliation).
 */

export const ANNUAL_OFFER_JOB = "billing.annual_offer";

const offerPayload = z.object({ reason: z.enum(["offer", "reminder"]) });

/** Inscrit les deux envois, dans la transaction qui crée l'abonnement. */
export async function scheduleAnnualOffers(
  tx: TenantTransaction,
  organizationId: string,
  facts: Pick<SubscriptionFacts, "startedAt">,
) {
  await enqueue(tx, {
    organizationId,
    kind: ANNUAL_OFFER_JOB,
    idempotencyKey: "billing:annual-offer",
    runAt: annualOfferOpensAt(facts),
    payload: { reason: "offer" },
  });
  await enqueue(tx, {
    organizationId,
    kind: ANNUAL_OFFER_JOB,
    idempotencyKey: "billing:annual-reminder",
    runAt: billingPeriod(facts, ANNUAL_REMINDER_MONTH).start,
    payload: { reason: "reminder" },
  });
}

async function loadFacts(
  tx: TenantTransaction,
): Promise<SubscriptionFacts | null> {
  const [row] = await tx.select().from(subscriptions);
  if (!row) return null;
  return {
    plan: row.plan,
    cycle: row.cycle,
    startedAt: row.startedAt,
    cycleChosenAt: row.cycleChosenAt,
    annualEndsAt: row.annualEndsAt,
    unpaidSince: row.unpaidSince,
    canceledAt: row.canceledAt,
    endsAt: row.endsAt,
  };
}

/** Membres actifs qui gèrent la facturation : les seuls destinataires. */
function billingManagers(tx: TenantTransaction) {
  return tx
    .select({ email: users.email, displayName: users.displayName })
    .from(membershipPermissions)
    .innerJoin(
      memberships,
      eq(memberships.id, membershipPermissions.membershipId),
    )
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(membershipPermissions.permission, "billing.manage"),
        isNull(memberships.deactivatedAt),
        isNull(users.disabledAt),
      ),
    );
}

export function billingHandlers(deps: {
  email: EmailSender;
  appUrl: string;
  clock?: () => Date;
}): Record<string, JobHandler> {
  const { email, appUrl, clock = () => new Date() } = deps;
  return {
    [ANNUAL_OFFER_JOB]: async ({ tx, job }) => {
      const parsed = offerPayload.safeParse(job.payload);
      if (!parsed.success) throw new JobError("invalid_payload");
      const now = clock();
      const facts = await loadFacts(tx);
      // Choix déjà fait, résiliation ou délai passé : rien à envoyer.
      if (!facts || !commitmentReminder(facts, now)) return;
      const recipients = await billingManagers(tx);
      const [organization] = await tx
        .select({ name: organizations.name })
        .from(organizations);
      if (!organization || recipients.length === 0) return;
      const plan = PLAN_CATALOG[facts.plan];
      const url = new URL("/app/facturation", appUrl).toString();
      for (const recipient of recipients)
        try {
          await email.send(
            annualOfferEmail(recipient.email, {
              displayName: recipient.displayName,
              organizationName: organization.name,
              reason: parsed.data.reason,
              planName: plan.label,
              annualPrice: formatEuros(plan.annualMonthlyCents),
              monthlyPrice: formatEuros(plan.monthlyCents),
              startsOn: formatDate(annualStartsAt(facts, now), "fr"),
              decideBefore: formatDate(
                billingPeriod(facts, COMMITMENT_DECISION_MONTH).start,
                "fr",
              ),
              url,
            }),
          );
        } catch {
          throw new JobError("provider_unavailable");
        }
      await tx.insert(auditEvents).values({
        organizationId: job.organizationId,
        actorMembershipId: null,
        action: "billing.annual_offer_sent",
        targetType: "organization",
        targetId: job.organizationId,
        metadata: { reason: parsed.data.reason, recipients: recipients.length },
      });
    },
  };
}
