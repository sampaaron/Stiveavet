import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import type { EmailSender } from "@/adapters/email/types";
import { auditOrganization, systemAuthor } from "@/domains/audit/journal";
import { JobError } from "@/domains/taches/kinds";
import { enqueue } from "@/domains/taches/queue";
import type { JobHandler } from "@/domains/taches/worker";
import {
  membershipPermissions,
  memberships,
  organizations,
  users,
} from "@/server/db/schema";
import type { TenantTransaction } from "@/server/db/tenant";
import { formatDate, formatEuros } from "@/ui/format";

import { annualOfferEmail } from "./emails";
import { loadFacts } from "./faits";
import {
  ANNUAL_REMINDER_MONTH,
  COMMITMENT_DECISION_MONTH,
  PLAN_CATALOG,
  annualOfferOpensAt,
  annualStartsAt,
  billingPeriod,
  commitmentReminder,
} from "./rules";
import type { SubscriptionFacts } from "./rules";

/**
 * Offre d'engagement annuel par e-mail (ADR 0023) : à 45 jours d'essai, puis rappel au début
 * du 6e mois. Les deux tâches sont inscrites à la création de l'abonnement ; chacune ne
 * fait rien si, à son heure, le choix n'est plus à faire (engagement pris, résiliation).
 * À son heure, la tâche inscrit un envoi par destinataire : une panne chez l'un, puis la
 * reprise, ne renvoie jamais l'e-mail aux autres (ADR 0014 §6, ADR 0041).
 */

export const ANNUAL_OFFER_JOB = "billing.annual_offer";

const offerPayload = z.object({
  reason: z.enum(["offer", "reminder"]),
  // Absent : tâche de départ, qui inscrit les envois.
  membershipId: z.uuid().optional(),
});

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

/** Membres actifs qui gèrent la facturation : les seuls destinataires. */
function billingManagers(tx: TenantTransaction, membershipId?: string) {
  return tx
    .select({
      membershipId: memberships.id,
      email: users.email,
      displayName: users.displayName,
    })
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
        membershipId ? eq(memberships.id, membershipId) : undefined,
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
      const { reason, membershipId } = parsed.data;
      const now = clock();
      const facts = await loadFacts(tx);
      // Choix déjà fait, résiliation ou délai passé : rien à envoyer.
      if (!facts || !commitmentReminder(facts, now)) return;
      if (!membershipId) {
        for (const recipient of await billingManagers(tx))
          await enqueue(tx, {
            organizationId: job.organizationId,
            kind: ANNUAL_OFFER_JOB,
            idempotencyKey: `annual_offer:${reason}:${recipient.membershipId}`,
            runAt: now,
            payload: { reason, membershipId: recipient.membershipId },
          });
        return;
      }
      // Destinataire qui ne gère plus la facturation entre-temps : rien à envoyer.
      const [recipient] = await billingManagers(tx, membershipId);
      const [organization] = await tx
        .select({ name: organizations.name })
        .from(organizations);
      if (!recipient || !organization) return;
      const plan = PLAN_CATALOG[facts.plan];
      try {
        await email.send(
          annualOfferEmail(recipient.email, {
            displayName: recipient.displayName,
            organizationName: organization.name,
            reason,
            planName: plan.label,
            annualPrice: formatEuros(plan.annualMonthlyCents, "fr"),
            monthlyPrice: formatEuros(plan.monthlyCents, "fr"),
            startsOn: formatDate(annualStartsAt(facts, now), "fr"),
            decideBefore: formatDate(
              billingPeriod(facts, COMMITMENT_DECISION_MONTH).start,
              "fr",
            ),
            url: new URL("/app/facturation", appUrl).toString(),
          }),
        );
      } catch {
        throw new JobError("provider_unavailable");
      }
      await auditOrganization(
        tx,
        systemAuthor(job.organizationId),
        "billing.annual_offer_sent",
        { reason, membershipId },
      );
    },
  };
}
