import { describe, expect, it } from "vitest";

import {
  INCLUDED_ACTIVE_FOLLOWUPS,
  LAUNCH_SURCHARGE_CENTS,
  PLANS,
  PLAN_CATALOG,
  REACTIVATION_SURCHARGE_CENTS,
  TRIAL_MONTHLY_CENTS,
  access,
  addMonths,
  annualOfferOpensAt,
  annualStartsAt,
  billingPeriod,
  canCommitAnnual,
  canStartFollowups,
  cancellationEffectiveAt,
  commitmentReminder,
  draftInvoice,
  formatEuros,
  isCanceled,
  maxVets,
  monthlyPriceCents,
  phase,
  restrictPermissions,
  subscriptionMonth,
  usageChargeCents,
} from "./rules";
import type { Access, SubscriptionFacts } from "./rules";

const START = new Date("2026-01-15T10:00:00Z");
const day = (n: number) => new Date(START.getTime() + n * 86_400_000);
const month = (n: number, extraDays = 0) =>
  new Date(addMonths(START, n).getTime() + extraDays * 86_400_000);

const facts = (
  overrides: Partial<SubscriptionFacts> = {},
): SubscriptionFacts => ({
  plan: "clinic",
  cycle: "monthly",
  startedAt: START,
  cycleChosenAt: null,
  annualEndsAt: null,
  unpaidSince: null,
  canceledAt: null,
  endsAt: null,
  ...overrides,
});
const idle = { activeFollowups: 0, lastFollowupEndedAt: null };
const busy = { activeFollowups: 3, lastFollowupEndedAt: null };

describe("catalogue (cahier des charges §13)", () => {
  it("reprend les prix HT et les limites de vétérinaires", () => {
    expect(PLANS.map((plan) => PLAN_CATALOG[plan].annualMonthlyCents)).toEqual([
      10_900, 14_900, 21_600, 27_900,
    ]);
    expect(PLANS.map((plan) => PLAN_CATALOG[plan].monthlyCents)).toEqual([
      13_900, 17_900, 24_600, 30_900,
    ]);
    expect(PLANS.map((plan) => maxVets(plan))).toEqual([1, 1, 3, 3]);
    expect(maxVets(null)).toBe(3);
    expect(TRIAL_MONTHLY_CENTS).toBe(8_600);
  });

  it("affiche les montants en euros", () => {
    expect(formatEuros(8_600).replace(/\s/g, " ")).toBe("86,00 €");
  });
});

describe("calendrier de l'abonnement", () => {
  it("ajoute des mois en gardant le dernier jour du mois", () => {
    expect(addMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString()).toBe(
      "2026-02-28T00:00:00.000Z",
    );
    expect(addMonths(new Date("2026-11-30T00:00:00Z"), 3).toISOString()).toBe(
      "2027-02-28T00:00:00.000Z",
    );
  });

  it("compte les mois à partir de 1 et borne chaque période", () => {
    expect(subscriptionMonth(facts(), START)).toBe(1);
    expect(subscriptionMonth(facts(), month(1, -1))).toBe(1);
    expect(subscriptionMonth(facts(), month(1))).toBe(2);
    expect(billingPeriod(facts(), 3)).toEqual({
      start: month(2),
      end: month(3),
    });
  });

  it("essai sur 2 mois, période souple jusqu'au 6e, puis formule établie", () => {
    expect(phase(facts(), month(1, 10))).toBe("trial");
    expect(phase(facts(), month(2))).toBe("flexible");
    expect(phase(facts(), month(5, 20))).toBe("flexible");
    expect(phase(facts(), month(6))).toBe("settled");
  });
});

describe("prix", () => {
  it("86 € HT pendant l'essai, puis le prix de la formule", () => {
    expect(monthlyPriceCents(facts(), 1)).toBe(8_600);
    expect(monthlyPriceCents(facts(), 2)).toBe(8_600);
    expect(monthlyPriceCents(facts(), 3)).toBe(24_600);
    expect(monthlyPriceCents(facts({ cycle: "annual" }), 3)).toBe(21_600);
  });

  it("aucune bascule annuelle automatique avant (ni après) le 7e mois", () => {
    const untouched = facts();
    for (const m of [3, 6, 7, 12])
      expect(monthlyPriceCents(untouched, m)).toBe(
        PLAN_CATALOG.clinic.monthlyCents,
      );
  });
});

describe("engagement annuel", () => {
  it("se propose à 45 jours d'essai, sur demande explicite seulement", () => {
    expect(annualOfferOpensAt(facts())).toEqual(day(45));
    expect(canCommitAnnual(facts(), day(44))).toBe(false);
    expect(canCommitAnnual(facts(), day(45))).toBe(true);
    expect(canCommitAnnual(facts(), month(4))).toBe(true);
    expect(canCommitAnnual(facts({ cycle: "annual" }), month(4))).toBe(false);
    expect(canCommitAnnual(facts({ canceledAt: month(3) }), month(4))).toBe(
      false,
    );
  });

  it("commence à la prochaine échéance, jamais pendant l'essai", () => {
    // Pris à 45 jours (mois 2) : effet au prélèvement du mois 3.
    expect(annualStartsAt(facts(), day(45))).toEqual(month(2));
    // Pris au mois 4 : effet au mois 5.
    expect(annualStartsAt(facts(), month(3, 10))).toEqual(month(4));
    // Même pris le premier jour, l'essai reste sans engagement.
    expect(annualStartsAt(facts(), day(1))).toEqual(month(2));
  });

  it("demande le choix dès l'offre, puis le redemande au 6e mois à un cabinet resté au mois", () => {
    expect(commitmentReminder(facts(), day(44))).toBe(false);
    expect(commitmentReminder(facts(), day(45))).toBe(true);
    expect(commitmentReminder(facts(), month(4))).toBe(true);
    // Resté au mois à 50 jours : plus de rappel avant le 6e mois…
    const stayed = facts({ cycleChosenAt: day(50) });
    expect(commitmentReminder(stayed, month(3))).toBe(false);
    // … puis un seul rappel pendant le 6e mois.
    expect(commitmentReminder(stayed, month(5, 1))).toBe(true);
    expect(commitmentReminder(stayed, month(6, 1))).toBe(false);
    // Un choix fait pendant le 6e mois n'est pas redemandé.
    expect(
      commitmentReminder(facts({ cycleChosenAt: month(5, 2) }), month(5, 3)),
    ).toBe(false);
    expect(
      commitmentReminder(
        facts({ cycle: "annual", cycleChosenAt: day(50) }),
        month(5, 1),
      ),
    ).toBe(false);
    expect(commitmentReminder(facts({ canceledAt: month(3) }), month(4))).toBe(
      false,
    );
    expect(commitmentReminder(facts(), month(7))).toBe(false);
  });
});

describe("résiliation", () => {
  it("prend effet à la fin du mois en cours, essai compris", () => {
    expect(cancellationEffectiveAt(facts(), day(10))).toEqual(month(1));
    expect(cancellationEffectiveAt(facts(), month(3, 5))).toEqual(month(4));
  });

  it("avec un engagement annuel, à la fin de l'engagement", () => {
    const annual = facts({ cycle: "annual", annualEndsAt: month(15) });
    expect(cancellationEffectiveAt(annual, month(4, 1))).toEqual(month(15));
    const ending = facts({ cycle: "annual", annualEndsAt: month(4) });
    expect(cancellationEffectiveAt(ending, month(4, 1))).toEqual(month(5));
    const unknownEnd = facts({ cycle: "annual" });
    expect(cancellationEffectiveAt(unknownEnd, month(4, 1))).toEqual(month(5));
  });

  it("n'est effective qu'à sa date d'effet", () => {
    const canceled = facts({ canceledAt: day(3), endsAt: month(1) });
    expect(isCanceled(canceled, day(20))).toBe(false);
    expect(isCanceled(canceled, month(1))).toBe(true);
    expect(isCanceled(facts(), month(9))).toBe(false);
  });
});

describe("accès du cabinet", () => {
  it("complet sans abonnement enregistré ou sans incident", () => {
    expect(access(null, START, idle)).toEqual({ kind: "full" });
    expect(access(facts(), month(5), busy)).toEqual({ kind: "full" });
  });

  it("impayé : 30 jours pour régulariser, tout reste possible", () => {
    const unpaid = facts({ unpaidSince: month(3) });
    const state = access(unpaid, month(3, 12), busy);
    expect(state).toEqual({
      kind: "grace",
      blockedAt: month(3, 30),
      daysLeft: 18,
    });
    expect(canStartFollowups(state)).toBe(true);
  });

  it("impayé à J+30 : nouveaux suivis bloqués, les suivis en cours continuent", () => {
    const unpaid = facts({ unpaidSince: month(3) });
    const state = access(unpaid, month(3, 30), busy);
    expect(state).toEqual({ kind: "blocked", reason: "unpaid" });
    expect(canStartFollowups(state)).toBe(false);
  });

  it("résiliation : bloqué tant qu'un suivi est en cours", () => {
    const canceled = facts({ canceledAt: month(3), endsAt: month(4) });
    expect(access(canceled, month(3, 10), busy)).toEqual({ kind: "full" });
    expect(access(canceled, month(4), busy)).toEqual({
      kind: "blocked",
      reason: "canceled",
    });
  });

  it("lecture seule 3 mois après la fin du dernier suivi, puis accès clos", () => {
    const canceled = facts({ canceledAt: month(3), endsAt: month(4) });
    const ended = { activeFollowups: 0, lastFollowupEndedAt: month(5) };
    expect(access(canceled, month(6), ended)).toEqual({
      kind: "read_only",
      reason: "canceled",
      until: month(8),
    });
    expect(access(canceled, month(8), ended)).toEqual({
      kind: "closed",
      reason: "canceled",
    });
    // Dernier suivi terminé avant la résiliation : les 3 mois partent de la résiliation.
    const earlier = { activeFollowups: 0, lastFollowupEndedAt: month(2) };
    expect(access(canceled, month(5), earlier)).toEqual({
      kind: "read_only",
      reason: "canceled",
      until: month(7),
    });
    expect(access(canceled, month(4), idle)).toEqual({
      kind: "read_only",
      reason: "canceled",
      until: month(7),
    });
  });

  it("impayé et résiliation : la première échéance l'emporte", () => {
    const unpaidFirst = facts({
      unpaidSince: month(2),
      canceledAt: month(3),
      endsAt: month(4),
    });
    expect(access(unpaidFirst, month(5), idle)).toEqual({
      kind: "read_only",
      reason: "unpaid",
      until: addMonths(month(2, 30), 3),
    });
    const canceledFirst = facts({
      unpaidSince: month(4, 5),
      canceledAt: month(3),
      endsAt: month(4),
    });
    expect(access(canceledFirst, month(5, 10), busy)).toEqual({
      kind: "blocked",
      reason: "canceled",
    });
    // Résiliation effective : le délai de régularisation ne rouvre pas l'accès.
    expect(access(canceledFirst, month(4, 6), busy)).toEqual({
      kind: "blocked",
      reason: "canceled",
    });
  });

  it("lecture seule : seuls les droits de consultation restent", () => {
    const all = new Set([
      "followups.read_own",
      "followups.launch",
      "team.manage",
      "billing.manage",
      "clinical.read",
    ]);
    const readOnly: Access = {
      kind: "read_only",
      reason: "canceled",
      until: month(8),
    };
    expect([...restrictPermissions(all, readOnly)].sort()).toEqual([
      "billing.manage",
      "clinical.read",
      "followups.read_own",
    ]);
    expect([
      ...restrictPermissions(all, { kind: "closed", reason: "unpaid" }),
    ]).toEqual(["billing.manage"]);
    expect(
      restrictPermissions(all, { kind: "blocked", reason: "unpaid" }),
    ).toEqual(all);
    expect(canStartFollowups(readOnly)).toBe(false);
  });
});

describe("suppléments d'usage", () => {
  it("10 suivis actifs inclus ; au-delà 2,50 € par lancement, 1,26 € par réactivation", () => {
    expect(usageChargeCents("launch", INCLUDED_ACTIVE_FOLLOWUPS - 1)).toBe(0);
    expect(usageChargeCents("launch", INCLUDED_ACTIVE_FOLLOWUPS)).toBe(
      LAUNCH_SURCHARGE_CENTS,
    );
    expect(usageChargeCents("reactivation", 9)).toBe(0);
    expect(usageChargeCents("reactivation", 12)).toBe(
      REACTIVATION_SURCHARGE_CENTS,
    );
    expect([LAUNCH_SURCHARGE_CENTS, REACTIVATION_SURCHARGE_CENTS]).toEqual([
      250, 126,
    ]);
  });
});

describe("factures", () => {
  it("abonnement du mois et suppléments du mois précédent, TVA 20 %", () => {
    const invoice = draftInvoice(facts(), 4, [
      { kind: "launch", amountCents: 250 },
      { kind: "launch", amountCents: 0 },
      { kind: "launch", amountCents: 250 },
      { kind: "reactivation", amountCents: 126 },
    ]);
    expect(invoice.lines).toEqual([
      {
        label: "Formule Clinique, sans engagement, mois 4",
        amountCents: 24_600,
      },
      {
        label: "2 lancement(s) au-delà de 10 suivis actifs",
        amountCents: 500,
      },
      {
        label: "1 réactivation(s) au-delà de 10 suivis actifs",
        amountCents: 126,
      },
    ]);
    expect(invoice.subtotalCents).toBe(25_226);
    expect(invoice.vatCents).toBe(5_045);
    expect(invoice.totalCents).toBe(30_271);
  });

  it("essai et engagement annuel", () => {
    expect(draftInvoice(facts(), 1, []).lines).toEqual([
      { label: "Essai pilote, mois 1 sur 2", amountCents: 8_600 },
    ]);
    expect(
      draftInvoice(facts({ cycle: "annual", plan: "solo" }), 8, []).lines,
    ).toEqual([
      {
        label: "Formule Solo, engagement annuel, mois 8",
        amountCents: 10_900,
      },
    ]);
  });
});
