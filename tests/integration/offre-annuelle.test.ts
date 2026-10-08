import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createOrganization } from "../../db/seed/cabinets-fictifs";
import { MemoryEmailSender } from "@/adapters/email/memory";
import { fakeBillingProvider } from "@/adapters/billing-provider/fake";
import type { Actor } from "@/domains/equipe/actor";
import { isPermissionKey } from "@/domains/equipe/permissions";
import {
  ANNUAL_OFFER_JOB,
  billingHandlers,
} from "@/domains/facturation/offre-annuelle";
import { addMonths } from "@/domains/facturation/rules";
import {
  billingService,
  startSubscription,
} from "@/domains/facturation/service";
import { JobError } from "@/domains/taches/kinds";
import type { JobPayload } from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";

import { pools } from "./support/db";

/**
 * Lot 20 (ADR 0023) : l'offre d'engagement annuel part par e-mail à 45 jours d'essai, puis
 * en rappel au 6e mois, seulement à qui gère la facturation et seulement si le choix reste
 * à faire.
 */

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

const DAY = 86_400_000;
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

async function cabinet(startedAt: Date) {
  const org = randomUUID();
  const tag = org.slice(0, 8);
  const [adminId] = await createOrganization(
    appDb,
    org,
    "Clinique de l'Offre",
    [
      {
        email: `oa-${tag}@essai.test`,
        displayName: "Dr Odile Admin",
        role: "admin_vet",
      },
      {
        email: `ov-${tag}@essai.test`,
        displayName: "Dr Oscar Vet",
        role: "vet",
      },
      {
        email: `os-${tag}@essai.test`,
        displayName: "Olga Asv",
        role: "assistant",
      },
    ],
  );
  if (!adminId) throw new Error("cabinet");
  await withTenant(appDb, { organizationId: org }, (tx) =>
    startSubscription(tx, org, "clinic", startedAt),
  );
  return { org, tag, owner: await actorOf(org, adminId) };
}

async function run(
  org: string,
  now: Date,
  payload: JobPayload,
  email = new MemoryEmailSender(),
) {
  const handler = billingHandlers({
    email,
    appUrl: "http://localhost:3000",
    clock: () => now,
  })[ANNUAL_OFFER_JOB];
  if (!handler) throw new Error("exécutant");
  await withTenant(appDb, { organizationId: org }, (tx) =>
    handler({
      tx,
      job: {
        id: randomUUID(),
        organizationId: org,
        kind: ANNUAL_OFFER_JOB,
        attempt: 1,
        followupId: null,
        payload,
        idempotencyKey: "billing:annual-offer",
      },
    }),
  );
  return email;
}

describe("offre d'engagement annuel par e-mail", () => {
  it("deux envois inscrits à la création de l'abonnement : 45e jour et début du 6e mois", async () => {
    const startedAt = new Date("2026-01-15T10:00:00Z");
    const { org } = await cabinet(startedAt);
    const { rows } = await admin.query(
      `SELECT idempotency_key, run_at, payload FROM scheduled_jobs
       WHERE organization_id = $1 AND kind = $2 ORDER BY run_at`,
      [org, ANNUAL_OFFER_JOB],
    );
    expect(rows).toEqual([
      {
        idempotency_key: "billing:annual-offer",
        run_at: new Date(startedAt.getTime() + 45 * DAY),
        payload: { reason: "offer" },
      },
      {
        idempotency_key: "billing:annual-reminder",
        run_at: addMonths(startedAt, 5),
        payload: { reason: "reminder" },
      },
    ]);
  });

  it("à 45 jours : un e-mail à qui gère la facturation, sans donnée clinique, journalisé", async () => {
    const startedAt = new Date(Date.now() - 46 * DAY);
    const { org, tag } = await cabinet(startedAt);
    const email = await run(org, new Date(), { reason: "offer" });
    expect(email.sent.map((message) => message.to)).toEqual([
      `oa-${tag}@essai.test`,
    ]);
    const [message] = email.sent;
    expect(message?.subject).toBe(
      "Après votre essai Stivea Vet : engagement annuel ou mensuel ?",
    );
    expect(message?.text).toMatch(/216,00\s€ HT par mois pendant 12 mois/);
    expect(message?.text).toContain("rien ne bascule automatiquement");
    expect(message?.text).toContain("http://localhost:3000/app/facturation");
    const { rows } = await admin.query(
      `SELECT metadata FROM audit_events
       WHERE organization_id = $1 AND action = 'billing.annual_offer_sent'`,
      [org],
    );
    expect(rows).toEqual([{ metadata: { reason: "offer", recipients: 1 } }]);
  });

  it("rien n'est envoyé si le choix est déjà fait ou l'abonnement résilié", async () => {
    const committed = await cabinet(new Date(Date.now() - 46 * DAY));
    await paying.chooseCycle(committed.owner, "annual");
    expect(
      (await run(committed.org, new Date(), { reason: "offer" })).sent,
    ).toEqual([]);

    const canceled = await cabinet(new Date(Date.now() - 46 * DAY));
    await paying.cancel(canceled.owner);
    expect(
      (await run(canceled.org, new Date(), { reason: "offer" })).sent,
    ).toEqual([]);
  });

  it("au 6e mois, rappel à un cabinet resté au mois ; plus rien après le choix", async () => {
    const startedAt = addMonths(new Date(), -5);
    const { org, owner } = await cabinet(new Date(startedAt.getTime() - DAY));
    // Resté au mois plus tôt (choix daté du 2e mois).
    await admin.query(
      "UPDATE subscriptions SET cycle_chosen_at = started_at + interval '50 days' WHERE organization_id = $1",
      [org],
    );
    const reminder = await run(org, new Date(), { reason: "reminder" });
    expect(reminder.sent).toHaveLength(1);
    expect(reminder.sent[0]?.subject).toBe(
      "Stivea Vet : dernier rappel pour l'engagement annuel",
    );
    await paying.chooseCycle(owner, "annual");
    expect((await run(org, new Date(), { reason: "reminder" })).sent).toEqual(
      [],
    );
  });

  it("une charge utile inconnue échoue proprement ; une panne d'envoi est réessayée", async () => {
    const { org } = await cabinet(new Date(Date.now() - 46 * DAY));
    await expect(run(org, new Date(), { reason: "autre" })).rejects.toEqual(
      new JobError("invalid_payload"),
    );
    const failing = new MemoryEmailSender();
    failing.send = () => Promise.reject(new Error("smtp"));
    await expect(
      run(org, new Date(), { reason: "offer" }, failing),
    ).rejects.toEqual(new JobError("provider_unavailable"));
  });
});
