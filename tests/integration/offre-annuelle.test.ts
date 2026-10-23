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
 * à faire. Un envoi par destinataire : une reprise ne renvoie rien aux autres (ADR 0041).
 * Horloge fixe : le résultat ne dépend pas du jour où les tests tournent.
 */

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

const DAY = 86_400_000;
const NOW = new Date("2027-03-10T10:00:00Z");
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

async function cabinet(startedAt: Date, options = { secondAdmin: false }) {
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
      ...(options.secondAdmin
        ? [
            {
              email: `ob-${tag}@essai.test`,
              displayName: "Dr Bruno Admin",
              role: "admin_vet" as const,
            },
          ]
        : []),
    ],
  );
  if (!adminId) throw new Error("cabinet");
  await withTenant(appDb, { organizationId: org }, (tx) =>
    startSubscription(tx, org, "premium", startedAt),
  );
  return { org, tag, owner: await actorOf(org, adminId) };
}

/** Exécute une tâche de l'offre, comme le worker, dans la transaction du cabinet. */
async function runJob(
  org: string,
  payload: JobPayload,
  email: MemoryEmailSender,
  idempotencyKey = "billing:annual-offer",
) {
  const handler = billingHandlers({
    email,
    appUrl: "http://localhost:3000",
    clock: () => NOW,
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
        idempotencyKey,
      },
    }),
  );
}

/** Envois par destinataire inscrits par la tâche de départ. */
async function deliveries(org: string) {
  const { rows } = await admin.query(
    `SELECT idempotency_key, payload FROM scheduled_jobs
     WHERE organization_id = $1 AND kind = $2 AND payload ? 'membershipId'
     ORDER BY idempotency_key`,
    [org, ANNUAL_OFFER_JOB],
  );
  return rows as { idempotency_key: string; payload: JobPayload }[];
}

/** Tâche de départ, puis chaque envoi : le parcours complet du worker. */
async function run(
  org: string,
  payload: JobPayload,
  email = new MemoryEmailSender(),
) {
  await runJob(org, payload, email);
  for (const job of await deliveries(org))
    await runJob(org, job.payload, email, job.idempotency_key);
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
    const { org, tag, owner } = await cabinet(
      new Date(NOW.getTime() - 46 * DAY),
    );
    const email = await run(org, { reason: "offer" });
    expect(email.sent.map((message) => message.to)).toEqual([
      `oa-${tag}@essai.test`,
    ]);
    expect(await deliveries(org)).toEqual([
      {
        idempotency_key: `annual_offer:offer:${owner.membershipId}`,
        payload: { reason: "offer", membershipId: owner.membershipId },
      },
    ]);
    const [message] = email.sent;
    expect(message?.subject).toBe(
      "Stivea Vet : engagement annuel ou mensuel ?",
    );
    expect(message?.text).toMatch(/305,00\s€ HT par mois pendant 12 mois/);
    expect(message?.text).toContain("rien ne bascule automatiquement");
    expect(message?.text).toContain("http://localhost:3000/app/facturation");
    const { rows } = await admin.query(
      `SELECT actor_membership_id, target_type, metadata FROM audit_events
       WHERE organization_id = $1 AND action = 'billing.annual_offer_sent'`,
      [org],
    );
    expect(rows).toEqual([
      {
        actor_membership_id: null,
        target_type: "organization",
        metadata: { reason: "offer", membershipId: owner.membershipId },
      },
    ]);
  });

  it("une panne chez un destinataire ne renvoie jamais l'e-mail aux autres", async () => {
    const { org, tag } = await cabinet(new Date(NOW.getTime() - 46 * DAY), {
      secondAdmin: true,
    });
    await runJob(org, { reason: "offer" }, new MemoryEmailSender());
    // Rejouer la tâche de départ n'inscrit pas d'envoi en double.
    await runJob(org, { reason: "offer" }, new MemoryEmailSender());
    const jobs = await deliveries(org);
    expect(jobs).toHaveLength(2);

    const email = new MemoryEmailSender();
    const send = email.send.bind(email);
    const down = `ob-${tag}@essai.test`;
    email.send = (message) =>
      message.to === down ? Promise.reject(new Error("smtp")) : send(message);
    const attempts = await Promise.allSettled(
      jobs.map((job) => runJob(org, job.payload, email, job.idempotency_key)),
    );
    expect(attempts.map((attempt) => attempt.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    // Reprise de l'envoi en échec seulement : chacun ne reçoit qu'un e-mail.
    email.send = send;
    const failed = jobs.filter(
      (_, index) => attempts[index]?.status === "rejected",
    );
    for (const job of failed)
      await runJob(org, job.payload, email, job.idempotency_key);
    expect(email.sent.map((message) => message.to).sort()).toEqual([
      `oa-${tag}@essai.test`,
      down,
    ]);
  });

  it("rien n'est envoyé si le choix est déjà fait ou l'abonnement résilié", async () => {
    const committed = await cabinet(new Date(NOW.getTime() - 46 * DAY));
    await paying.chooseCycle(committed.owner, "annual", NOW);
    expect((await run(committed.org, { reason: "offer" })).sent).toEqual([]);

    const canceled = await cabinet(new Date(NOW.getTime() - 46 * DAY));
    await paying.cancel(canceled.owner, NOW);
    expect((await run(canceled.org, { reason: "offer" })).sent).toEqual([]);
  });

  it("au 6e mois, rappel à un cabinet resté au mois ; plus rien après le choix", async () => {
    const startedAt = addMonths(NOW, -5);
    const { org, owner } = await cabinet(new Date(startedAt.getTime() - DAY));
    // Resté au mois plus tôt (choix daté du 2e mois).
    await admin.query(
      "UPDATE subscriptions SET cycle_chosen_at = started_at + interval '50 days' WHERE organization_id = $1",
      [org],
    );
    const reminder = await run(org, { reason: "reminder" });
    expect(reminder.sent).toHaveLength(1);
    expect(reminder.sent[0]?.subject).toBe(
      "Stivea Vet : dernier rappel pour l'engagement annuel",
    );
    await paying.chooseCycle(owner, "annual", NOW);
    expect(
      (await run(org, { reason: "reminder" }, new MemoryEmailSender())).sent,
    ).toEqual([]);
  });

  it("une charge utile inconnue échoue proprement ; une panne d'envoi est réessayée", async () => {
    const { org, owner } = await cabinet(new Date(NOW.getTime() - 46 * DAY));
    await expect(
      runJob(org, { reason: "autre" }, new MemoryEmailSender()),
    ).rejects.toEqual(new JobError("invalid_payload"));
    const failing = new MemoryEmailSender();
    failing.send = () => Promise.reject(new Error("smtp"));
    await expect(
      runJob(
        org,
        { reason: "offer", membershipId: owner.membershipId },
        failing,
      ),
    ).rejects.toEqual(new JobError("provider_unavailable"));
  });
});
