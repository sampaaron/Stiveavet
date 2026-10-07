/**
 * Règles de facturation (cahier des charges §13), sans accès à la base ni à l'horloge :
 * chaque fonction reçoit l'instant `now`. Montants en centimes d'euro, hors taxes.
 * Couvert à 100 % par `rules.test.ts`.
 */

export const PLANS = ["solo", "solo_pro", "clinic", "clinic_pro"] as const;
export type Plan = (typeof PLANS)[number];
export type BillingCycle = "monthly" | "annual";

export type PlanDefinition = {
  label: string;
  /** Prix mensuel avec engagement annuel. */
  annualMonthlyCents: number;
  /** Prix mensuel sans engagement. */
  monthlyCents: number;
  maxVets: number;
  stive: string;
};

export const PLAN_CATALOG: Record<Plan, PlanDefinition> = {
  solo: {
    label: "Solo",
    annualMonthlyCents: 10_900,
    monthlyCents: 13_900,
    maxVets: 1,
    stive: "Stive limité",
  },
  solo_pro: {
    label: "Solo Pro",
    annualMonthlyCents: 14_900,
    monthlyCents: 17_900,
    maxVets: 1,
    stive: "Stive plus complet",
  },
  clinic: {
    label: "Clinique",
    annualMonthlyCents: 21_600,
    monthlyCents: 24_600,
    maxVets: 3,
    stive: "Un Stive par vétérinaire, avec une limite plus basse",
  },
  clinic_pro: {
    label: "Clinique Pro",
    annualMonthlyCents: 27_900,
    monthlyCents: 30_900,
    maxVets: 3,
    stive: "Un Stive personnel plus complet par vétérinaire",
  },
};

export const TRIAL_MONTHLY_CENTS = 8_600;
export const TRIAL_MONTHS = 2;
/** Mois à partir duquel un engagement annuel peut être demandé (mois 3 à 6 : sur demande). */
export const ANNUAL_FROM_MONTH = 3;
/** Le choix explicite doit être fait avant ce mois ; aucune bascule automatique. */
export const COMMITMENT_DECISION_MONTH = 7;
export const INCLUDED_ACTIVE_FOLLOWUPS = 10;
export const LAUNCH_SURCHARGE_CENTS = 250;
export const REACTIVATION_SURCHARGE_CENTS = 126;
export const UNPAID_GRACE_DAYS = 30;
export const READ_ONLY_MONTHS = 3;
/** TVA française au taux normal (à confirmer avec l'expert-comptable avant facturation réelle). */
export const VAT_RATE_PERCENT = 20;

const DAY_MS = 86_400_000;

/** Ajoute des mois en UTC, en ramenant au dernier jour du mois si besoin (31 janv. + 1 → 28/29 févr.). */
export function addMonths(date: Date, months: number): Date {
  const target = new Date(date.getTime());
  const day = target.getUTCDate();
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

/** Faits enregistrés pour l'abonnement d'un cabinet ; tout l'état en est déduit. */
export type SubscriptionFacts = {
  plan: Plan;
  cycle: BillingCycle;
  startedAt: Date;
  /** Choix explicite du cycle (annuel ou rester au mois) ; null : pas encore choisi. */
  cycleChosenAt: Date | null;
  /** Fin de l'engagement annuel en cours. */
  annualEndsAt: Date | null;
  /** Premier prélèvement échoué non régularisé. */
  unpaidSince: Date | null;
  canceledAt: Date | null;
  /** Date d'effet de la résiliation. */
  endsAt: Date | null;
};

/** Mois d'abonnement en cours, à partir de 1. */
export function subscriptionMonth(facts: SubscriptionFacts, now: Date): number {
  let month = 1;
  while (addMonths(facts.startedAt, month) <= now) month += 1;
  return month;
}

/** Début et fin du mois d'abonnement `month`. */
export function billingPeriod(
  facts: Pick<SubscriptionFacts, "startedAt">,
  month: number,
): { start: Date; end: Date } {
  return {
    start: addMonths(facts.startedAt, month - 1),
    end: addMonths(facts.startedAt, month),
  };
}

export type Phase = "trial" | "flexible" | "settled";

/** Essai (mois 1–2), période souple (mois 3–6), puis formule choisie ou mensuelle. */
export function phase(facts: SubscriptionFacts, now: Date): Phase {
  const month = subscriptionMonth(facts, now);
  if (month <= TRIAL_MONTHS) return "trial";
  if (month < COMMITMENT_DECISION_MONTH) return "flexible";
  return "settled";
}

/** Prix HT du mois d'abonnement `month`. */
export function monthlyPriceCents(
  facts: Pick<SubscriptionFacts, "plan" | "cycle">,
  month: number,
): number {
  if (month <= TRIAL_MONTHS) return TRIAL_MONTHLY_CENTS;
  const plan = PLAN_CATALOG[facts.plan];
  return facts.cycle === "annual" ? plan.annualMonthlyCents : plan.monthlyCents;
}

export function isCanceled(facts: SubscriptionFacts, now: Date): boolean {
  return facts.endsAt !== null && facts.endsAt <= now;
}

/** L'engagement annuel ne se prend que sur demande explicite, à partir du mois 3. */
export function canCommitAnnual(facts: SubscriptionFacts, now: Date): boolean {
  return (
    facts.canceledAt === null &&
    facts.cycle === "monthly" &&
    subscriptionMonth(facts, now) >= ANNUAL_FROM_MONTH
  );
}

/** Rappel du choix à faire avant le 7e mois ; sans réponse, la formule reste mensuelle. */
export function commitmentReminder(
  facts: SubscriptionFacts,
  now: Date,
): boolean {
  return (
    facts.canceledAt === null &&
    facts.cycleChosenAt === null &&
    phase(facts, now) === "flexible"
  );
}

/**
 * Date d'effet d'une résiliation demandée à `now` : fin du mois d'abonnement en cours,
 * ou fin de l'engagement annuel s'il court encore.
 */
export function cancellationEffectiveAt(
  facts: SubscriptionFacts,
  now: Date,
): Date {
  const { end } = billingPeriod(facts, subscriptionMonth(facts, now));
  if (
    facts.cycle === "annual" &&
    facts.annualEndsAt &&
    facts.annualEndsAt > end
  )
    return facts.annualEndsAt;
  return end;
}

export type Access =
  /** Tout est possible. */
  | { kind: "full" }
  /** Prélèvement échoué : régulariser avant `blockedAt` ; tout reste possible jusque-là. */
  | { kind: "grace"; blockedAt: Date; daysLeft: number }
  /** Impayé de plus de 30 jours ou résiliation : les suivis en cours continuent, aucun nouveau. */
  | { kind: "blocked"; reason: "unpaid" | "canceled" }
  /** Plus aucun suivi en cours : lecture seule jusqu'à `until`. */
  | { kind: "read_only"; reason: "unpaid" | "canceled"; until: Date }
  /** Fin de la lecture seule. */
  | { kind: "closed"; reason: "unpaid" | "canceled" };

export type Activity = {
  /** Suivis actifs, hors suivis test. */
  activeFollowups: number;
  /** Fin du dernier suivi terminé (null : aucun). */
  lastFollowupEndedAt: Date | null;
};

/** Accès du cabinet. Sans abonnement enregistré (cabinet antérieur), l'accès est complet. */
export function access(
  facts: SubscriptionFacts | null,
  now: Date,
  activity: Activity,
): Access {
  if (!facts) return { kind: "full" };
  let stopAt: Date | null = null;
  let reason: "unpaid" | "canceled" = "canceled";
  if (isCanceled(facts, now) && facts.endsAt) stopAt = facts.endsAt;
  if (facts.unpaidSince) {
    const blockedAt = new Date(
      facts.unpaidSince.getTime() + UNPAID_GRACE_DAYS * DAY_MS,
    );
    if (blockedAt > now && stopAt === null)
      return {
        kind: "grace",
        blockedAt,
        daysLeft: Math.ceil((blockedAt.getTime() - now.getTime()) / DAY_MS),
      };
    if (blockedAt <= now && (stopAt === null || blockedAt < stopAt)) {
      stopAt = blockedAt;
      reason = "unpaid";
    }
  }
  if (stopAt === null) return { kind: "full" };
  if (activity.activeFollowups > 0) return { kind: "blocked", reason };
  const lastEnd =
    activity.lastFollowupEndedAt && activity.lastFollowupEndedAt > stopAt
      ? activity.lastFollowupEndedAt
      : stopAt;
  const until = addMonths(lastEnd, READ_ONLY_MONTHS);
  if (until > now) return { kind: "read_only", reason, until };
  return { kind: "closed", reason };
}

/** Un nouveau suivi ou une réactivation n'est possible qu'en accès complet ou en délai de régularisation. */
export function canStartFollowups(state: Access): boolean {
  return state.kind === "full" || state.kind === "grace";
}

export type UsageKind = "launch" | "reactivation";

/** Supplément d'un lancement ou d'une réactivation, selon les suivis déjà actifs. */
export function usageChargeCents(
  kind: UsageKind,
  activeFollowupsBefore: number,
): number {
  if (activeFollowupsBefore < INCLUDED_ACTIVE_FOLLOWUPS) return 0;
  return kind === "launch"
    ? LAUNCH_SURCHARGE_CENTS
    : REACTIVATION_SURCHARGE_CENTS;
}

export type InvoiceLine = { label: string; amountCents: number };
export type InvoiceDraft = {
  lines: InvoiceLine[];
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
};

/**
 * Facture du mois `month` : l'abonnement du mois, plus les suppléments du mois précédent
 * (« prélevés avec l'abonnement suivant »).
 */
export function draftInvoice(
  facts: Pick<SubscriptionFacts, "plan" | "cycle">,
  month: number,
  usage: { kind: UsageKind; amountCents: number }[],
): InvoiceDraft {
  const plan = PLAN_CATALOG[facts.plan];
  const lines: InvoiceLine[] = [
    {
      label:
        month <= TRIAL_MONTHS
          ? `Essai pilote, mois ${month} sur ${TRIAL_MONTHS}`
          : `Formule ${plan.label}, ${facts.cycle === "annual" ? "engagement annuel" : "sans engagement"}, mois ${month}`,
      amountCents: monthlyPriceCents(facts, month),
    },
  ];
  for (const kind of ["launch", "reactivation"] as const) {
    const charged = usage.filter(
      (event) => event.kind === kind && event.amountCents > 0,
    );
    if (!charged.length) continue;
    lines.push({
      label: `${charged.length} ${kind === "launch" ? "lancement(s)" : "réactivation(s)"} au-delà de ${INCLUDED_ACTIVE_FOLLOWUPS} suivis actifs`,
      amountCents: charged.reduce((sum, event) => sum + event.amountCents, 0),
    });
  }
  const subtotalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  const vatCents = Math.round((subtotalCents * VAT_RATE_PERCENT) / 100);
  return {
    lines,
    subtotalCents,
    vatCents,
    totalCents: subtotalCents + vatCents,
  };
}

/** Vétérinaires autorisés par la formule (3 sans abonnement enregistré). */
export function maxVets(plan: Plan | null): number {
  return plan ? PLAN_CATALOG[plan].maxVets : 3;
}

/** `12 345` → `123,45 €` */
export function formatEuros(cents: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

/** Droits conservés en lecture seule : consulter, jamais modifier ni lancer. */
export const READ_ONLY_PERMISSIONS = [
  "followups.read_all",
  "followups.read_own",
  "followups.read_summary",
  "clinical.read",
  "agenda.read",
  "activity_log.read",
  "billing.manage",
] as const;

/**
 * Permissions effectives selon l'accès : toutes, celles de lecture (lecture seule), ou la
 * seule consultation de la facturation (accès clos). Les droits en base ne changent pas.
 */
export function restrictPermissions<T extends string>(
  permissions: ReadonlySet<T>,
  state: Access,
): Set<T> {
  if (state.kind === "read_only" || state.kind === "closed") {
    const kept: readonly string[] =
      state.kind === "read_only" ? READ_ONLY_PERMISSIONS : ["billing.manage"];
    return new Set([...permissions].filter((key) => kept.includes(key)));
  }
  return new Set(permissions);
}
