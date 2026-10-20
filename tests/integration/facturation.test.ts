import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { createOrganization } from "../../db/seed/cabinets-fictifs";
import { fakeBillingProvider } from "@/adapters/billing-provider/fake";
import { fakeDrVeto } from "@/adapters/drveto/fake";
import { fakePaymentMandate } from "@/adapters/payments/fake";
import { DomainError } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import { isPermissionKey } from "@/domains/equipe/permissions";
import { settingsService } from "@/domains/reglages/service";
import { vetLimit } from "@/domains/facturation/limits";
import {
  PLAN_CATALOG,
  addMonths,
  introOfferOpen,
} from "@/domains/facturation/rules";
import type { Plan } from "@/domains/facturation/rules";
import {
  billingService,
  recordUsage,
  startSubscription,
} from "@/domains/facturation/service";
import { animals, followups, integrationConnections } from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";

import { asApp, errorCode, pools } from "./support/db";

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

const paying = billingService({ db: appDb, provider: fakeBillingProvider() });

async function actorOf(org: string, membershipId: string): Promise<Actor> {
  const { rows } = await admin.query(
    `SELECT m.user_id, m.role, array_remove(array_agg(p.permission), NULL) AS permissions
     FROM memberships m LEFT JOIN membership_permissions p ON p.membership_id = m.id
     WHERE m.id = $1 GROUP BY m.id`,
    [membershipId],
  );
  const row = rows[0] as
    { user_id: string; role: Actor["role"]; permissions: string[] } | undefined;
  if (!row) throw new Error("membre inconnu");
  return {
    organizationId: org,
    userId: row.user_id,
    membershipId,
    role: row.role,
    permissions: new Set(row.permissions.filter(isPermissionKey)),
  };
}

async function domainError(promise: Promise<unknown>) {
  try {
    await promise;
    return undefined;
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
}

/** Cabinet neuf abonné depuis `startedAt`, avec un administrateur, un vétérinaire et un assistant. */
async function cabinet(
  startedAt: Date,
  plan: Plan = "premium",
  options: { mandate?: boolean; vets?: number; assistants?: number } = {},
) {
  const org = randomUUID();
  const tag = org.slice(0, 8);
  const members = await createOrganization(
    appDb,
    org,
    "Clinique d'essai de la facturation",
    [
      {
        email: `fa-${tag}@essai.test`,
        displayName: "Dr Fanny Admin",
        role: "admin_vet",
      },
      ...((options.vets ?? 1) > 1
        ? [
            {
              email: `fv-${tag}@essai.test`,
              displayName: "Dr Félix Vet",
              role: "vet" as const,
            },
          ]
        : []),
      ...Array.from({ length: options.assistants ?? 1 }, (_, index) => ({
        email: `fas${index}-${tag}@essai.test`,
        displayName: "Fred Asv",
        role: "assistant" as const,
      })),
    ],
  );
  const [adminId] = members;
  const assistantId = members[members.length - 1];
  if (!adminId || !assistantId) throw new Error("cabinet");
  const owner = await actorOf(org, adminId);
  await withTenant(appDb, { organizationId: org }, async (tx) => {
    await startSubscription(tx, org, plan, startedAt);
    if (options.mandate !== false)
      await tx.insert(integrationConnections).values({
        organizationId: org,
        provider: "payment_mandate",
        displayLabel: "Mandat de prélèvement simulé",
        connectedByMembershipId: adminId,
      });
  });
  return { org, owner, assistant: await actorOf(org, assistantId) };
}

/** Ajoute `n` suivis au statut donné ; renvoie leurs identifiants. */
async function addFollowups(
  owner: Actor,
  n: number,
  status: "active" | "ended" | "draft" = "active",
  isTest = false,
): Promise<string[]> {
  return withTenant(
    appDb,
    { organizationId: owner.organizationId },
    async (tx) => {
      const [animal] = await tx
        .insert(animals)
        .values({
          organizationId: owner.organizationId,
          name: "Animal fictif",
          species: "cat",
        })
        .returning({ id: animals.id });
      if (!animal) throw new Error("animal");
      const ids: string[] = [];
      for (let i = 0; i < n; i += 1) {
        const id = randomUUID();
        ids.push(id);
        await tx.insert(followups).values({
          id,
          organizationId: owner.organizationId,
          animalId: animal.id,
          responsibleMembershipId: owner.membershipId,
          procedure: "Intervention fictive",
          procedureAt: new Date(),
          status,
          isTest,
          endedAt: status === "ended" ? new Date() : null,
        });
      }
      return ids;
    },
  );
}

function usage(
  owner: Actor,
  followupId: string,
  kind: "launch" | "reactivation",
  now = new Date(),
  idempotencyKey = `${kind}:${followupId}`,
) {
  return withTenant(appDb, { organizationId: owner.organizationId }, (tx) =>
    recordUsage(
      tx,
      owner.organizationId,
      { followupId, kind, idempotencyKey },
      now,
    ),
  );
}

const day = 86_400_000;

/**
 * Prix des 6 premiers mois : celui de l'offre de lancement pour un cabinet inscrit avant sa
 * fin (règle couverte par rules.test.ts), sinon le prix attendu.
 */
const firstMonthsPrice = (plan: Plan, start: Date, regularCents: number) =>
  introOfferOpen(start) ? PLAN_CATALOG[plan].introMonthlyCents : regularCents;

describe("échéances et prélèvements simulés", () => {
  it("émet une facture par mois écoulé, une seule fois, et prélève sur le mandat", async () => {
    const start = addMonths(new Date(), -3);
    const { owner } = await cabinet(start);
    const first = await paying.overview(owner);
    const again = await paying.overview(owner);

    expect(first.month).toBe(4);
    expect(first.phase).toBe("flexible");
    expect(first.invoices.map((invoice) => invoice.subscriptionMonth)).toEqual([
      4, 3, 2, 1,
    ]);
    expect(first.invoices.every((invoice) => invoice.status === "paid")).toBe(
      true,
    );
    expect(again.invoices.map((invoice) => invoice.id)).toEqual(
      first.invoices.map((invoice) => invoice.id),
    );
    expect(new Set(first.invoices.map((invoice) => invoice.number)).size).toBe(
      4,
    );
    // Prix de la formule Premium sans engagement dès le 1er mois ; TVA 20 %.
    const premium = firstMonthsPrice("premium", start, 35_900);
    expect(first.invoices.map((invoice) => invoice.subtotalCents)).toEqual([
      premium,
      premium,
      premium,
      premium,
    ]);
    expect(first.invoices[3]?.totalCents).toBe((premium * 6) / 5);
    expect(first.access).toEqual({ kind: "full" });
    expect(first.commitmentReminder).toBe(true);
    expect(first.nextPriceCents).toBe(premium);
  });

  it("sans mandat signé, les factures restent à prélever, sans impayé", async () => {
    const { owner } = await cabinet(addMonths(new Date(), -1), "premium", {
      mandate: false,
    });
    const overview = await paying.overview(owner);
    expect(overview.invoices.map((invoice) => invoice.status)).toEqual([
      "open",
      "open",
    ]);
    expect(overview.mandateSigned).toBe(false);
    expect(overview.access).toEqual({ kind: "full" });
  });

  it("un prélèvement refusé ouvre 30 jours de régularisation, puis bloque les nouveaux suivis", async () => {
    const start = addMonths(new Date(), -2);
    const { org, owner } = await cabinet(start);
    const declining = billingService({
      db: appDb,
      provider: fakeBillingProvider({ decline: new Set([org]) }),
    });
    const [running] = await addFollowups(owner, 1);
    const [fresh] = await addFollowups(owner, 1, "draft");
    if (!running || !fresh) throw new Error("suivis");

    const overview = await declining.overview(owner);
    expect(
      overview.invoices.every((invoice) => invoice.status === "failed"),
    ).toBe(true);
    expect(overview.access.kind).toBe("grace");
    const later = new Date(Date.now() + 31 * day);
    expect((await declining.accessFor(owner, later)).access).toEqual({
      kind: "blocked",
      reason: "unpaid",
    });
    // Les suivis en cours continuent ; aucun nouveau lancement.
    expect(await domainError(usage(owner, fresh, "launch", later))).toBe(
      "billing_blocked",
    );

    expect(await paying.settle(owner)).toBe("paid");
    const settled = await paying.overview(owner);
    expect(settled.access).toEqual({ kind: "full" });
    expect(settled.invoices.every((invoice) => invoice.status === "paid")).toBe(
      true,
    );
    expect((await paying.accessFor(owner, later)).access).toEqual({
      kind: "full",
    });
    expect(await domainError(paying.settle(owner))).toBe("invalid_target");
  });
});

describe("suppléments d'usage", () => {
  it("Starter : 15 suivis actifs inclus ; le 16e lancement coûte 2,50 €, une réactivation 1,26 €", async () => {
    const start = addMonths(new Date(), -3);
    const { owner } = await cabinet(start, "starter");
    await addFollowups(owner, 15);
    await addFollowups(owner, 2, "active", true); // suivis test : jamais comptés
    const [eleventh] = await addFollowups(owner, 1, "draft");
    const [old] = await addFollowups(owner, 1, "ended");
    if (!eleventh || !old) throw new Error("suivis");

    expect(await usage(owner, eleventh, "launch")).toEqual({
      amountCents: 250,
    });
    // Même clé : compté une seule fois.
    expect(await usage(owner, eleventh, "launch")).toEqual({
      amountCents: 250,
    });
    expect(await usage(owner, old, "reactivation")).toEqual({
      amountCents: 126,
    });

    const overview = await paying.overview(owner);
    expect(overview.activeFollowups).toBe(15);
    expect(overview.pending).toEqual({
      launches: 1,
      reactivations: 1,
      amountCents: 376,
    });

    // Prélevés avec l'abonnement suivant, une seule fois.
    const next = addMonths(overview.period?.end ?? new Date(), 0);
    const billed = await paying.overview(owner, new Date(next.getTime() + 1));
    const latest = billed.invoices[0];
    expect(latest?.lines.map((line) => line.amountCents)).toEqual([
      firstMonthsPrice("starter", start, 8_900),
      250,
      126,
    ]);
    expect(billed.pending.amountCents).toBe(0);
    const { rows } = await admin.query(
      "SELECT count(*)::int AS n FROM usage_events WHERE organization_id = $1",
      [owner.organizationId],
    );
    expect(rows[0]).toEqual({ n: 2 });
  });

  it("en dessous des suivis inclus, un lancement est compris", async () => {
    const { owner } = await cabinet(new Date());
    const [first] = await addFollowups(owner, 1);
    if (!first) throw new Error("suivi");
    // Le suivi lancé ne se compte pas lui-même.
    expect(await usage(owner, first, "launch")).toEqual({ amountCents: 0 });
  });

  it("au plafond de la formule, aucun nouveau lancement (dépassement maîtrisé)", async () => {
    const { owner } = await cabinet(new Date(), "starter");
    await addFollowups(owner, 30);
    const [extra] = await addFollowups(owner, 1, "draft");
    if (!extra) throw new Error("suivi");
    expect(await domainError(usage(owner, extra, "launch"))).toBe(
      "plan_quota_reached",
    );
    // Passer à Pro relève aussitôt le plafond (80) et les suivis inclus (40).
    await paying.changePlan(owner, "pro");
    expect(await usage(owner, extra, "launch")).toEqual({ amountCents: 0 });
  });
});

describe("formule et engagement", () => {
  it("l'engagement annuel est proposé à 45 jours d'essai et commence après l'essai", async () => {
    const day = 86_400_000;
    const early = await cabinet(new Date(Date.now() - 40 * day));
    expect(await domainError(paying.chooseCycle(early.owner, "annual"))).toBe(
      "invalid_target",
    );
    // La base refuse aussi un engagement pris avant le 45e jour…
    const code = await errorCode(
      asApp(app, early.org, (client) =>
        client.query(
          "UPDATE subscriptions SET cycle = 'annual', cycle_chosen_at = now(), annual_ends_at = started_at + interval '14 months'",
        ),
      ),
    );
    expect(code).toBe("23514");

    // … et un engagement qui couvrirait l'essai.
    const offered = await cabinet(new Date(Date.now() - 46 * day));
    expect(
      await errorCode(
        asApp(app, offered.org, (client) =>
          client.query(
            "UPDATE subscriptions SET cycle = 'annual', cycle_chosen_at = now(), annual_ends_at = now() + interval '1 year'",
          ),
        ),
      ),
    ).toBe("23514");
    const trial = await paying.overview(offered.owner);
    expect(trial.phase).toBe("trial");
    expect(trial.canCommitAnnual).toBe(true);
    expect(trial.commitmentReminder).toBe(true);
    expect((await paying.accessFor(offered.owner)).commitmentReminder).toBe(
      true,
    );
    await paying.chooseCycle(offered.owner, "annual");
    const committed = await paying.overview(offered.owner);
    expect(committed.facts?.cycle).toBe("annual");
    // Prix sans engagement jusqu'à la fin des 2 premiers mois, puis le tarif annuel pendant 12 mois.
    const startedAt = committed.facts?.startedAt ?? new Date();
    expect(committed.nextPriceCents).toBe(
      firstMonthsPrice("premium", startedAt, 30_500),
    );
    expect(committed.facts?.annualEndsAt).toEqual(addMonths(startedAt, 14));
    expect(committed.commitmentReminder).toBe(false);

    const flexibleStart = addMonths(new Date(), -2);
    const flexible = await cabinet(flexibleStart);
    await paying.chooseCycle(flexible.owner, "annual");
    const overview = await paying.overview(flexible.owner);
    expect(overview.facts?.cycle).toBe("annual");
    expect(overview.nextPriceCents).toBe(
      firstMonthsPrice("premium", flexibleStart, 30_500),
    );
    expect(overview.commitmentReminder).toBe(false);
    expect(await domainError(paying.changePlan(flexible.owner, "pro"))).toBe(
      "invalid_target",
    );
  });

  it("rester au mois est un choix explicite, qui arrête le rappel", async () => {
    const { owner } = await cabinet(addMonths(new Date(), -3));
    await paying.chooseCycle(owner, "monthly");
    const overview = await paying.overview(owner);
    expect(overview.facts?.cycle).toBe("monthly");
    expect(overview.commitmentReminder).toBe(false);
    expect(await domainError(paying.chooseCycle(owner, "monthly"))).toBe(
      "invalid_target",
    );
  });

  it("une formule trop petite pour l'équipe est refusée", async () => {
    const { org, owner } = await cabinet(new Date(), "premium", { vets: 2 });
    expect(await domainError(paying.changePlan(owner, "starter"))).toBe(
      "plan_vet_limit",
    );
    expect(await domainError(paying.changePlan(owner, "illimité"))).toBe(
      "invalid_target",
    );
    await paying.changePlan(owner, "pro");
    expect((await paying.overview(owner)).facts?.plan).toBe("pro");

    const team = await cabinet(new Date(), "premium", { assistants: 2 });
    expect(await domainError(paying.changePlan(team.owner, "starter"))).toBe(
      "plan_assistant_limit",
    );
    expect((await paying.overview(team.owner)).assistantSeats).toBe(2);

    const solo = await cabinet(new Date(), "starter");
    expect(
      await withTenant(appDb, { organizationId: solo.org }, (tx) =>
        vetLimit(tx),
      ),
    ).toBe(1);
    expect(
      await withTenant(appDb, { organizationId: org }, (tx) => vetLimit(tx)),
    ).toBe(2);
  });
});

describe("intégrations avancées (dr.veto)", () => {
  const settings = settingsService({
    db: appDb,
    whatsapp: { live: false },
    drveto: fakeDrVeto,
    payments: fakePaymentMandate,
  });

  it("réservées à Premium, vérifiées côté serveur", async () => {
    const { owner } = await cabinet(new Date(), "pro");
    expect(
      await domainError(settings.connect(owner, "drveto", "CAB-1234")),
    ).toBe("plan_feature_missing");
    // L'étape du démarrage guidé est alors sans objet.
    const onboarding = await settings.onboarding(owner);
    expect(onboarding.advancedIntegrations).toBe(false);
    expect(onboarding.steps.drveto).toBe(true);
    expect((await settings.get(owner)).advancedIntegrations).toBe(false);

    const premium = await cabinet(new Date(), "premium");
    await settings.connect(premium.owner, "drveto", "CAB-1234");
    // Pas de retour à une offre sans intégrations tant que dr.veto est connecté.
    expect(await domainError(paying.changePlan(premium.owner, "pro"))).toBe(
      "plan_integration_connected",
    );
    await settings.disconnect(premium.owner, "drveto");
    await paying.changePlan(premium.owner, "pro");
    expect((await paying.overview(premium.owner)).facts?.plan).toBe("pro");
  });
});

describe("résiliation", () => {
  it("effet en fin de mois ; suivis en cours terminés, puis lecture seule 3 mois", async () => {
    const start = addMonths(new Date(), -3);
    const { org, owner } = await cabinet(start);
    const [running] = await addFollowups(owner, 1);
    if (!running) throw new Error("suivi");

    const endsAt = await paying.cancel(owner);
    expect(endsAt).toEqual(addMonths(start, 4));
    expect(await domainError(paying.cancel(owner))).toBe("invalid_target");
    expect(await domainError(paying.chooseCycle(owner, "annual"))).toBe(
      "invalid_target",
    );

    const after = new Date(endsAt.getTime() + day);
    expect((await paying.accessFor(owner, after)).access).toEqual({
      kind: "blocked",
      reason: "canceled",
    });
    // Aucune échéance après la date d'effet.
    const overview = await paying.overview(owner, addMonths(endsAt, 2));
    expect(Math.max(...overview.invoices.map((i) => i.subscriptionMonth))).toBe(
      4,
    );

    await withTenant(appDb, { organizationId: org }, (tx) =>
      tx
        .update(followups)
        .set({ status: "ended", endedAt: after })
        .where(eq(followups.id, running)),
    );
    expect(
      (await paying.accessFor(owner, new Date(after.getTime() + day))).access,
    ).toEqual({
      kind: "read_only",
      reason: "canceled",
      until: addMonths(after, 3),
    });
    expect((await paying.accessFor(owner, addMonths(after, 3))).access).toEqual(
      {
        kind: "closed",
        reason: "canceled",
      },
    );
  });
});

describe("droits et intégrité", () => {
  it("sans gestion de la facturation, rien n'est visible", async () => {
    const { assistant } = await cabinet(new Date());
    expect(await domainError(paying.overview(assistant))).toBe("not_found");
    expect(await domainError(paying.cancel(assistant))).toBe("not_found");
  });

  it("une facture émise ne se modifie ni ne se supprime ; un usage n'est facturé qu'une fois", async () => {
    const { org, owner } = await cabinet(addMonths(new Date(), -1));
    const overview = await paying.overview(owner);
    const invoiceId = overview.invoices[0]?.id;

    const changed = await errorCode(
      asApp(app, org, (client) =>
        client.query("UPDATE invoices SET total_cents = 0 WHERE id = $1", [
          invoiceId,
        ]),
      ),
    );
    expect(changed).toBe("42501");
    const unpaid = await errorCode(
      asApp(app, org, (client) =>
        client.query(
          "UPDATE invoices SET status = 'open', paid_at = NULL WHERE id = $1",
          [invoiceId],
        ),
      ),
    );
    expect(unpaid).toBe("42501");
    // Seule évolution d'une facture payée : une contestation bancaire la repasse en refusée.
    await asApp(app, org, (client) =>
      client.query(
        "UPDATE invoices SET status = 'failed', paid_at = NULL WHERE id = $1",
        [invoiceId],
      ),
    );
    for (const table of [
      "invoices",
      "subscriptions",
      "usage_events",
      "payment_events",
    ]) {
      const code = await errorCode(
        asApp(app, org, (client) => client.query(`DELETE FROM ${table}`)),
      );
      expect(code, table).toBe("42501");
    }
  });

  it("le service refuse un abonnement inexistant", async () => {
    const org = randomUUID();
    const [adminId] = await createOrganization(
      appDb,
      org,
      "Cabinet sans abonnement",
      [
        {
          email: `ns-${org.slice(0, 8)}@essai.test`,
          displayName: "Dr Noé Sans",
          role: "admin_vet",
        },
      ],
    );
    if (!adminId) throw new Error("cabinet");
    const owner = await actorOf(org, adminId);
    const overview = await paying.overview(owner);
    expect(overview.facts).toBeNull();
    expect(overview.access).toEqual({ kind: "full" });
    expect(await domainError(paying.cancel(owner))).toBe("invalid_target");
  });
});
