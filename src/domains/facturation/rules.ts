import { nombre } from "@/i18n/pluriel";

/**
 * Règles de facturation (cahier des charges §13), sans accès à la base ni à l'horloge :
 * chaque fonction reçoit l'instant `now`. Montants en centimes d'euro, hors taxes.
 * Couvert à 100 % par `rules.test.ts`.
 */

export const PLANS = ["starter", "pro", "premium"] as const;
export type Plan = (typeof PLANS)[number];
export type BillingCycle = "monthly" | "annual";

/**
 * Formule et quotas. Tout se règle ici : prix, places, suivis actifs inclus et plafond des
 * dépassements, fonctions incluses. Le serveur applique ces limites ; l'écran ne fait que
 * les afficher.
 */
export type PlanDefinition = {
  label: string;
  /** Prix mensuel sans engagement. */
  monthlyCents: number;
  /** Prix mensuel avec engagement annuel. */
  annualMonthlyCents: number;
  maxVets: number;
  /** Assistants vétérinaires ; null : sans limite. */
  maxAssistants: number | null;
  /** Suivis actifs compris dans le prix ; au-delà, chaque lancement est facturé. */
  includedActiveFollowups: number;
  /** Plafond des suivis actifs : au-delà, aucun nouveau lancement (dépassement maîtrisé). */
  maxActiveFollowups: number;
  /** Stive, l'assistant IA interne de l'équipe. */
  stive: boolean;
  /**
   * Demandes à Stive par personne et par mois de Paris (cahier des charges §10) : jamais
   * illimité, jamais affiché sur le site ; 0 sans Stive.
   */
  stiveMonthlyRequests: number;
  /** Intégrations avancées : connexion au logiciel du cabinet (dr.veto). */
  advancedIntegrations: boolean;
};

export const PLAN_CATALOG: Record<Plan, PlanDefinition> = {
  starter: {
    label: "Starter",
    monthlyCents: 7_900,
    annualMonthlyCents: 6_700,
    maxVets: 1,
    maxAssistants: 1,
    includedActiveFollowups: 15,
    maxActiveFollowups: 30,
    stive: false,
    stiveMonthlyRequests: 0,
    advancedIntegrations: false,
  },
  pro: {
    label: "Pro",
    monthlyCents: 15_500,
    annualMonthlyCents: 13_200,
    maxVets: 2,
    maxAssistants: 3,
    includedActiveFollowups: 40,
    maxActiveFollowups: 80,
    stive: true,
    stiveMonthlyRequests: 200,
    advancedIntegrations: false,
  },
  premium: {
    label: "Premium",
    monthlyCents: 23_100,
    annualMonthlyCents: 19_600,
    maxVets: 3,
    maxAssistants: null,
    includedActiveFollowups: 100,
    maxActiveFollowups: 200,
    stive: true,
    stiveMonthlyRequests: 600,
    advancedIntegrations: true,
  },
};

/** Offre mise en avant (inscription, tarifs). */
export const FEATURED_PLAN: Plan = "pro";

/** Prix d'entrée affiché sur le site (« à partir de »). */
export const STARTING_PRICE_CENTS = Math.min(
  ...PLANS.map((plan) => PLAN_CATALOG[plan].monthlyCents),
);

/** Cabinet antérieur aux abonnements : limites de la formule la plus complète. */
const LEGACY_PLAN: Plan = "premium";

export function planDefinition(plan: Plan | null): PlanDefinition {
  return PLAN_CATALOG[plan ?? LEGACY_PLAN];
}

/**
 * Deux premiers mois sans engagement possible (ADR 0023) ; l'engagement annuel est proposé
 * vers un mois et demi et ne commence qu'au 3e mois.
 */
export const TRIAL_MONTHS = 2;
/**
 * Jour de l'essai où l'engagement annuel est proposé (décision d'Aaron du 8 octobre 2026,
 * ADR 0023) : vers un mois et demi, pour le prélèvement suivant. L'engagement ne commence
 * jamais avant la fin de l'essai.
 */
const ANNUAL_OFFER_DAYS = 45;
/** Mois où l'engagement est reproposé à un cabinet resté au mois. */
export const ANNUAL_REMINDER_MONTH = 6;
/** Le choix explicite doit être fait avant ce mois ; aucune bascule automatique. */
export const COMMITMENT_DECISION_MONTH = 7;
export const LAUNCH_SURCHARGE_CENTS = 250;
export const REACTIVATION_SURCHARGE_CENTS = 126;
const UNPAID_GRACE_DAYS = 30;
const READ_ONLY_MONTHS = 3;
/** TVA française au taux normal (à confirmer avec l'expert-comptable avant facturation réelle). */
const VAT_RATE_PERCENT = 20;

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
  const plan = PLAN_CATALOG[facts.plan];
  return facts.cycle === "annual" && month > TRIAL_MONTHS
    ? plan.annualMonthlyCents
    : plan.monthlyCents;
}

export function isCanceled(facts: SubscriptionFacts, now: Date): boolean {
  return facts.endsAt !== null && facts.endsAt <= now;
}

/** Ouverture de l'offre d'engagement annuel, pendant l'essai. */
export function annualOfferOpensAt(
  facts: Pick<SubscriptionFacts, "startedAt">,
): Date {
  return new Date(facts.startedAt.getTime() + ANNUAL_OFFER_DAYS * DAY_MS);
}

/** Début de l'engagement pris à `now` : la prochaine échéance, jamais pendant l'essai. */
export function annualStartsAt(facts: SubscriptionFacts, now: Date): Date {
  const next = Math.max(subscriptionMonth(facts, now) + 1, TRIAL_MONTHS + 1);
  return billingPeriod(facts, next).start;
}

/** L'engagement annuel ne se prend que sur demande explicite, une fois l'offre ouverte. */
export function canCommitAnnual(facts: SubscriptionFacts, now: Date): boolean {
  return (
    facts.canceledAt === null &&
    facts.cycle === "monthly" &&
    now >= annualOfferOpensAt(facts)
  );
}

/**
 * Le choix est demandé à l'ouverture de l'offre, puis redemandé au 6e mois à un cabinet
 * resté au mois ; sans réponse, la formule reste mensuelle.
 */
export function commitmentReminder(
  facts: SubscriptionFacts,
  now: Date,
): boolean {
  if (!canCommitAnnual(facts, now)) return false;
  const month = subscriptionMonth(facts, now);
  if (month >= COMMITMENT_DECISION_MONTH) return false;
  if (facts.cycleChosenAt === null) return true;
  const reminderStart = billingPeriod(facts, ANNUAL_REMINDER_MONTH).start;
  return month === ANNUAL_REMINDER_MONTH && facts.cycleChosenAt < reminderStart;
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

/** Le plafond de la formule laisse-t-il lancer ou réactiver un suivi de plus ? */
export function withinFollowupCap(
  plan: Plan | null,
  activeFollowupsBefore: number,
): boolean {
  return activeFollowupsBefore < planDefinition(plan).maxActiveFollowups;
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
  plan: Plan | null,
): number {
  if (activeFollowupsBefore < planDefinition(plan).includedActiveFollowups)
    return 0;
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
      label: `Formule ${plan.label}, ${facts.cycle === "annual" && month > TRIAL_MONTHS ? "engagement annuel" : "sans engagement"}, mois ${month}`,
      amountCents: monthlyPriceCents(facts, month),
    },
  ];
  for (const kind of ["launch", "reactivation"] as const) {
    const charged = usage.filter(
      (event) => event.kind === kind && event.amountCents > 0,
    );
    if (!charged.length) continue;
    lines.push({
      label: `${kind === "launch" ? nombre(charged.length, "lancement", "lancements") : nombre(charged.length, "réactivation", "réactivations")} au-delà de ${plan.includedActiveFollowups} suivis actifs`,
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
  return planDefinition(plan).maxVets;
}

/** Assistants autorisés par la formule ; null : sans limite. */
export function maxAssistants(plan: Plan | null): number | null {
  return planDefinition(plan).maxAssistants;
}

/** `12 345` → `123,45 €` */
export function formatEuros(cents: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

/** Droits conservés en lecture seule : consulter, jamais modifier ni lancer. */
const READ_ONLY_PERMISSIONS = [
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
  plan: Plan | null = null,
): Set<T> {
  let kept = [...permissions];
  if (state.kind === "read_only" || state.kind === "closed") {
    const allowed: readonly string[] =
      state.kind === "read_only" ? READ_ONLY_PERMISSIONS : ["billing.manage"];
    kept = kept.filter((key) => allowed.includes(key));
  }
  // Stive n'est pas compris dans toutes les formules.
  if (!planDefinition(plan).stive)
    kept = kept.filter((key) => key !== "stive.use");
  return new Set(kept);
}
