import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  max,
  ne,
} from "drizzle-orm";
import { z } from "zod";

import { BillingUnavailableError } from "@/adapters/billing-provider/types";
import type { BillingProvider } from "@/adapters/billing-provider/types";
import { auditOrganization as audit } from "@/domains/audit/journal";
import { DomainError, assertPermission } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import { vetSeats } from "@/domains/equipe/service";
import {
  auditEvents,
  followups,
  integrationConnections,
  invoices,
  paymentEvents,
  subscriptions,
  usageEvents,
} from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import type { Database, TenantTransaction } from "@/server/db/tenant";

import {
  PLANS,
  PLAN_CATALOG,
  access,
  addMonths,
  annualStartsAt,
  billingPeriod,
  canCommitAnnual,
  canStartFollowups,
  cancellationEffectiveAt,
  commitmentReminder,
  draftInvoice,
  monthlyPriceCents,
  phase,
  subscriptionMonth,
  usageChargeCents,
} from "./rules";
import { scheduleAnnualOffers } from "./offre-annuelle";
import { recordPayment, refreshUnpaid, settleInvoice } from "./paiements";
import type {
  Access,
  Activity,
  Phase,
  Plan,
  SubscriptionFacts,
  UsageKind,
} from "./rules";

const planInput = z.enum(PLANS);
const DEFER_MS = 15 * 60_000;

/** Statuts qui occupent une place parmi les suivis actifs (un brouillon n'en occupe pas). */
const ACTIVE_STATUSES = ["active", "paused", "human_takeover"] as const;

export type InvoiceSummary = {
  id: string;
  number: string;
  subscriptionMonth: number;
  periodStart: Date;
  periodEnd: Date;
  lines: { label: string; amountCents: number }[];
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  status: "open" | "paid" | "failed" | "processing";
  issuedAt: Date;
};

export type BillingOverview = {
  facts: SubscriptionFacts | null;
  month: number | null;
  phase: Phase | null;
  period: { start: Date; end: Date } | null;
  /** Prix HT du prochain mois facturé. */
  nextPriceCents: number | null;
  access: Access;
  activeFollowups: number;
  /** Suppléments déjà dus, prélevés avec l'abonnement suivant. */
  pending: { launches: number; reactivations: number; amountCents: number };
  invoices: InvoiceSummary[];
  canCommitAnnual: boolean;
  commitmentReminder: boolean;
  /** Vétérinaires actifs et invités, comparés à la limite de chaque formule. */
  vetSeats: number;
  mandateSigned: boolean;
  /** Prélèvements simulés (poste local) ou réels, par Stripe (ADR 0027). */
  simulated: boolean;
};

async function loadFacts(
  tx: TenantTransaction,
  lock = false,
): Promise<SubscriptionFacts | null> {
  const query = tx.select().from(subscriptions);
  const [row] = lock ? await query.for("update") : await query;
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

/** Suivis actifs (hors suivis test) et fin du dernier suivi terminé. */
export async function followupActivity(
  tx: TenantTransaction,
): Promise<Activity> {
  const [active] = await tx
    .select({ n: count() })
    .from(followups)
    .where(
      and(
        inArray(followups.status, [...ACTIVE_STATUSES]),
        eq(followups.isTest, false),
      ),
    );
  const [ended] = await tx
    .select({ last: max(followups.endedAt) })
    .from(followups)
    .where(eq(followups.isTest, false));
  return {
    activeFollowups: active?.n ?? 0,
    lastFollowupEndedAt: ended?.last ?? null,
  };
}

/**
 * Abonnement créé à l'inscription : essai de 2 mois, puis la formule choisie. L'offre
 * d'engagement annuel est programmée en même temps (ADR 0023).
 */
export async function startSubscription(
  tx: TenantTransaction,
  organizationId: string,
  plan: Plan,
  startedAt = new Date(),
) {
  await tx.insert(subscriptions).values({ organizationId, plan, startedAt });
  await scheduleAnnualOffers(tx, organizationId, { startedAt });
}

/**
 * Enregistre un lancement ou une réactivation, dans la transaction qui la réalise :
 * refusé si les nouveaux suivis sont bloqués, supplément au-delà de 10 suivis actifs.
 * Idempotent : une même clé ne compte qu'une fois.
 */
export async function recordUsage(
  tx: TenantTransaction,
  organizationId: string,
  input: { followupId: string; kind: UsageKind; idempotencyKey: string },
  now = new Date(),
): Promise<{ amountCents: number }> {
  const facts = await loadFacts(tx, true);
  const activity = await followupActivity(tx);
  if (!canStartFollowups(access(facts, now, activity)))
    throw new DomainError("billing_blocked");
  const [existing] = await tx
    .select({ amountCents: usageEvents.amountCents })
    .from(usageEvents)
    .where(eq(usageEvents.idempotencyKey, input.idempotencyKey));
  if (existing) return existing;
  // Le suivi lancé ne compte pas parmi ceux déjà actifs.
  const [self] = await tx
    .select({ n: count() })
    .from(followups)
    .where(
      and(
        eq(followups.id, input.followupId),
        inArray(followups.status, [...ACTIVE_STATUSES]),
        eq(followups.isTest, false),
      ),
    );
  const activeBefore = activity.activeFollowups - (self?.n ?? 0);
  const amountCents = usageChargeCents(input.kind, activeBefore);
  await tx.insert(usageEvents).values({
    organizationId,
    followupId: input.followupId,
    kind: input.kind,
    activeBefore,
    amountCents,
    occurredAt: now,
    idempotencyKey: input.idempotencyKey,
  });
  return { amountCents };
}

export function billingService(deps: {
  db: Database;
  provider: BillingProvider;
}) {
  const { db, provider } = deps;
  const run = <T>(actor: Actor, fn: (tx: TenantTransaction) => Promise<T>) => {
    assertPermission(actor, "billing.manage");
    return withTenant(
      db,
      { organizationId: actor.organizationId, userId: actor.userId },
      fn,
    );
  };

  /** Mandat signé ; avec Stripe, seul un mandat confirmé par Stripe compte. */
  async function mandateSigned(tx: TenantTransaction): Promise<boolean> {
    const [row] = await tx
      .select({ provider: integrationConnections.provider })
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.provider, "payment_mandate"),
          provider.simulated
            ? undefined
            : eq(integrationConnections.mode, "live"),
        ),
      );
    return Boolean(row);
  }

  /** Après une panne du prestataire, pas de nouvel essai avant 15 minutes. */
  async function recentlyDeferred(
    tx: TenantTransaction,
    now: Date,
  ): Promise<boolean> {
    const [row] = await tx
      .select({ n: count() })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.action, "invoice.collection_deferred"),
          gt(auditEvents.occurredAt, new Date(now.getTime() - DEFER_MS)),
        ),
      );
    return (row?.n ?? 0) > 0;
  }

  /**
   * Prélève une facture et enregistre le résultat : payée ou refusée tout de suite (simulé),
   * ou en cours jusqu'à l'événement de Stripe. Un refus ouvre le délai de 30 jours ; une
   * panne du prestataire laisse la facture à prélever, sans rien bloquer.
   */
  async function collect(
    tx: TenantTransaction,
    organizationId: string,
    invoice: { id: string; number: string; totalCents: number },
    now: Date,
  ): Promise<"paid" | "failed" | "processing" | "deferred"> {
    // Chaque essai a son numéro : un appel rejoué garde la même clé d'idempotence.
    const [tried] = await tx
      .select({ n: count() })
      .from(paymentEvents)
      .where(
        and(
          eq(paymentEvents.invoiceId, invoice.id),
          inArray(paymentEvents.kind, ["submitted", "failed"]),
        ),
      );
    let result;
    try {
      result = await provider.collect(tx, {
        organizationId,
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        amountCents: invoice.totalCents,
        attempt: (tried?.n ?? 0) + 1,
      });
    } catch (error) {
      if (!(error instanceof BillingUnavailableError)) throw error;
      await audit(
        tx,
        { organizationId: organizationId, membershipId: null },
        "invoice.collection_deferred",
        {
          invoiceId: invoice.id,
          code: error.code,
        },
      );
      return "deferred";
    }
    if (result.status === "processing") {
      await recordPayment(tx, organizationId, {
        invoiceId: invoice.id,
        kind: "submitted",
        providerRef: result.providerRef,
        amountCents: invoice.totalCents,
        now,
      });
      await tx
        .update(invoices)
        .set({ status: "processing", paidAt: null })
        .where(
          and(
            eq(invoices.id, invoice.id),
            inArray(invoices.status, ["open", "failed"]),
          ),
        );
      await refreshUnpaid(tx, now);
      await audit(
        tx,
        { organizationId: organizationId, membershipId: null },
        "invoice.submitted",
        {
          invoiceId: invoice.id,
        },
      );
      return "processing";
    }
    await settleInvoice(tx, organizationId, {
      invoiceId: invoice.id,
      outcome: result.status,
      providerRef: result.providerRef,
      amountCents: invoice.totalCents,
      now,
      simulated: provider.simulated,
    });
    return result.status === "succeeded" ? "paid" : "failed";
  }

  /** Une échéance à émettre, ou une facture ouverte à prélever (mandat signé). */
  async function due(
    tx: TenantTransaction,
    facts: SubscriptionFacts,
    now: Date,
  ): Promise<boolean> {
    const [last] = await tx
      .select({ month: max(invoices.subscriptionMonth) })
      .from(invoices);
    const lastMonth = last?.month ?? 0;
    const next = billingPeriod(facts, lastMonth + 1);
    if (
      lastMonth < subscriptionMonth(facts, now) &&
      !(facts.endsAt && next.start >= facts.endsAt)
    )
      return true;
    const [open] = await tx
      .select({ n: count() })
      .from(invoices)
      .where(eq(invoices.status, "open"));
    return (
      (open?.n ?? 0) > 0 &&
      (await mandateSigned(tx)) &&
      !(await recentlyDeferred(tx, now))
    );
  }

  /**
   * Émet les échéances dues (une facture par mois d'abonnement, jamais deux) et prélève les
   * factures ouvertes une fois le mandat signé. Idempotent ; en phase 1 il tourne à la
   * première requête qui suit une échéance, une tâche planifiée le fera ensuite.
   */
  async function sync(
    tx: TenantTransaction,
    organizationId: string,
    now: Date,
  ): Promise<SubscriptionFacts | null> {
    const current = await loadFacts(tx);
    if (!current || !(await due(tx, current, now))) return current;
    // Verrou de l'abonnement, puis nouvelle lecture : deux requêtes simultanées n'émettent qu'une fois.
    const facts = await loadFacts(tx, true);
    if (!facts) return null;
    const currentMonth = subscriptionMonth(facts, now);
    const [last] = await tx
      .select({ month: max(invoices.subscriptionMonth) })
      .from(invoices);
    const [open] = await tx
      .select({ n: count() })
      .from(invoices)
      .where(eq(invoices.status, "open"));
    const lastMonth = last?.month ?? 0;
    if (lastMonth >= currentMonth && (open?.n ?? 0) === 0) return facts;

    for (let month = lastMonth + 1; month <= currentMonth; month += 1) {
      const period = billingPeriod(facts, month);
      // Aucune échéance après la date d'effet d'une résiliation.
      if (facts.endsAt && period.start >= facts.endsAt) break;
      const usage = await tx
        .select({
          id: usageEvents.id,
          kind: usageEvents.kind,
          amountCents: usageEvents.amountCents,
        })
        .from(usageEvents)
        .where(
          and(
            isNull(usageEvents.invoiceId),
            lt(usageEvents.occurredAt, period.start),
          ),
        );
      const draft = draftInvoice(facts, month, usage);
      const [issued] = await tx.select({ n: count() }).from(invoices);
      const number = `SV-${period.start.getUTCFullYear()}-${String((issued?.n ?? 0) + 1).padStart(3, "0")}`;
      const [invoice] = await tx
        .insert(invoices)
        .values({
          organizationId,
          number,
          subscriptionMonth: month,
          periodStart: period.start,
          periodEnd: period.end,
          lines: draft.lines,
          subtotalCents: draft.subtotalCents,
          vatCents: draft.vatCents,
          totalCents: draft.totalCents,
          issuedAt: period.start > now ? now : period.start,
        })
        .returning({ id: invoices.id });
      if (!invoice) throw new Error("Émission de facture impossible");
      if (usage.length)
        await tx
          .update(usageEvents)
          .set({ invoiceId: invoice.id })
          .where(
            inArray(
              usageEvents.id,
              usage.map((event) => event.id),
            ),
          );
      await audit(
        tx,
        { organizationId: organizationId, membershipId: null },
        "invoice.issued",
        {
          invoiceId: invoice.id,
          month,
        },
      );
    }

    if ((await mandateSigned(tx)) && !(await recentlyDeferred(tx, now))) {
      const pending = await tx
        .select({
          id: invoices.id,
          number: invoices.number,
          totalCents: invoices.totalCents,
        })
        .from(invoices)
        .where(eq(invoices.status, "open"))
        .orderBy(asc(invoices.subscriptionMonth));
      for (const invoice of pending)
        if ((await collect(tx, organizationId, invoice, now)) === "deferred")
          break;
    }
    return loadFacts(tx);
  }

  async function overviewIn(
    tx: TenantTransaction,
    organizationId: string,
    now: Date,
  ): Promise<BillingOverview> {
    const facts = await sync(tx, organizationId, now);
    const activity = await followupActivity(tx);
    const unbilled = await tx
      .select({ kind: usageEvents.kind, amountCents: usageEvents.amountCents })
      .from(usageEvents)
      .where(
        and(isNull(usageEvents.invoiceId), ne(usageEvents.amountCents, 0)),
      );
    const rows = await tx
      .select()
      .from(invoices)
      .orderBy(desc(invoices.subscriptionMonth));
    const month = facts ? subscriptionMonth(facts, now) : null;
    return {
      facts,
      month,
      phase: facts ? phase(facts, now) : null,
      period: facts && month ? billingPeriod(facts, month) : null,
      nextPriceCents:
        facts && month && !facts.canceledAt
          ? monthlyPriceCents(facts, month + 1)
          : null,
      access: access(facts, now, activity),
      activeFollowups: activity.activeFollowups,
      pending: {
        launches: unbilled.filter((e) => e.kind === "launch").length,
        reactivations: unbilled.filter((e) => e.kind === "reactivation").length,
        amountCents: unbilled.reduce((sum, e) => sum + e.amountCents, 0),
      },
      invoices: rows.map((row) => ({
        id: row.id,
        number: row.number,
        subscriptionMonth: row.subscriptionMonth,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        lines: row.lines,
        subtotalCents: row.subtotalCents,
        vatCents: row.vatCents,
        totalCents: row.totalCents,
        status: row.status,
        issuedAt: row.issuedAt,
      })),
      canCommitAnnual: facts ? canCommitAnnual(facts, now) : false,
      commitmentReminder: facts ? commitmentReminder(facts, now) : false,
      vetSeats: await vetSeats(tx),
      mandateSigned: await mandateSigned(tx),
      simulated: provider.simulated,
    };
  }

  /** Abonnement modifiable : ni résilié, ni en lecture seule. */
  async function editableFacts(
    tx: TenantTransaction,
    organizationId: string,
    now: Date,
  ): Promise<SubscriptionFacts> {
    const facts = await sync(tx, organizationId, now);
    if (!facts || facts.canceledAt) throw new DomainError("invalid_target");
    return facts;
  }

  return {
    /**
     * Accès du cabinet, après rattrapage des échéances, et choix d'engagement en attente ;
     * lu par la garde serveur à chaque requête.
     */
    async accessFor(
      context: { organizationId: string; userId: string },
      now = new Date(),
    ): Promise<{ access: Access; commitmentReminder: boolean }> {
      return withTenant(db, context, async (tx) => {
        const facts = await sync(tx, context.organizationId, now);
        return {
          access: access(facts, now, await followupActivity(tx)),
          commitmentReminder: facts ? commitmentReminder(facts, now) : false,
        };
      });
    },

    async overview(actor: Actor, now = new Date()): Promise<BillingOverview> {
      return run(actor, (tx) => overviewIn(tx, actor.organizationId, now));
    },

    /** Formule appliquée à partir de la prochaine échéance ; la limite de vétérinaires s'applique. */
    async changePlan(actor: Actor, plan: unknown, now = new Date()) {
      const parsed = planInput.safeParse(plan);
      if (!parsed.success) throw new DomainError("invalid_target");
      await run(actor, async (tx) => {
        const facts = await editableFacts(tx, actor.organizationId, now);
        if (facts.plan === parsed.data) return;
        if (facts.cycle === "annual") throw new DomainError("invalid_target");
        if ((await vetSeats(tx)) > PLAN_CATALOG[parsed.data].maxVets)
          throw new DomainError("plan_vet_limit");
        await tx.update(subscriptions).set({ plan: parsed.data });
        await audit(
          tx,
          {
            organizationId: actor.organizationId,
            membershipId: actor.membershipId,
          },
          "subscription.plan_changed",
          {
            from: facts.plan,
            to: parsed.data,
          },
        );
      });
    },

    /** Choix explicite : engagement annuel (offert dès 45 jours d'essai) ou rester au mois. */
    async chooseCycle(
      actor: Actor,
      cycle: "annual" | "monthly",
      now = new Date(),
    ) {
      await run(actor, async (tx) => {
        const facts = await editableFacts(tx, actor.organizationId, now);
        if (cycle === "annual") {
          if (!canCommitAnnual(facts, now))
            throw new DomainError("invalid_target");
          await tx.update(subscriptions).set({
            cycle: "annual",
            cycleChosenAt: now,
            // 12 mois à partir de la prochaine échéance, jamais pendant l'essai.
            annualEndsAt: addMonths(annualStartsAt(facts, now), 12),
          });
        } else {
          if (facts.cycle !== "monthly" || facts.cycleChosenAt)
            throw new DomainError("invalid_target");
          await tx.update(subscriptions).set({ cycleChosenAt: now });
        }
        await audit(
          tx,
          {
            organizationId: actor.organizationId,
            membershipId: actor.membershipId,
          },
          "subscription.cycle_chosen",
          {
            cycle,
          },
        );
      });
    },

    /** Résiliation : effet en fin de mois (ou d'engagement) ; les suivis en cours continuent. */
    async cancel(actor: Actor, now = new Date()) {
      return run(actor, async (tx) => {
        const facts = await editableFacts(tx, actor.organizationId, now);
        const endsAt = cancellationEffectiveAt(facts, now);
        await tx.update(subscriptions).set({ canceledAt: now, endsAt });
        await audit(
          tx,
          {
            organizationId: actor.organizationId,
            membershipId: actor.membershipId,
          },
          "subscription.canceled",
          {
            endsAt: endsAt.toISOString(),
          },
        );
        return endsAt;
      });
    },

    /**
     * Régularisation : nouveau prélèvement des factures refusées. Réglée tout de suite
     * (simulé), en cours (Stripe, issue sous quelques jours) ou de nouveau refusée.
     */
    async settle(
      actor: Actor,
      now = new Date(),
    ): Promise<"paid" | "processing" | "failed"> {
      return run(actor, async (tx) => {
        await sync(tx, actor.organizationId, now);
        if (!(await mandateSigned(tx))) throw new DomainError("invalid_target");
        const failed = await tx
          .select({
            id: invoices.id,
            number: invoices.number,
            totalCents: invoices.totalCents,
          })
          .from(invoices)
          .where(eq(invoices.status, "failed"))
          .orderBy(asc(invoices.subscriptionMonth));
        if (!failed.length) throw new DomainError("invalid_target");
        const results: string[] = [];
        for (const invoice of failed)
          results.push(await collect(tx, actor.organizationId, invoice, now));
        // Prestataire injoignable pour tout : rien n'a été tenté, le cabinet réessaiera.
        if (results.every((result) => result === "deferred"))
          throw new DomainError("payment_provider_unavailable");
        const outcome = results.includes("failed")
          ? "failed"
          : results.includes("processing")
            ? "processing"
            : "paid";
        await audit(
          tx,
          {
            organizationId: actor.organizationId,
            membershipId: actor.membershipId,
          },
          "subscription.settlement_requested",
          {
            invoices: failed.length,
            outcome,
          },
        );
        return outcome;
      });
    },
  };
}

export type BillingService = ReturnType<typeof billingService>;
