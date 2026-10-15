import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createOrganization } from "../../db/seed/cabinets-fictifs";
import { enqueue } from "@/domains/taches/queue";
import { onTenantCommitWake, withTenant } from "@/server/db/tenant";

import { pools } from "./support/db";

/** Réveil du worker (ADR 0028) : seulement après la validation d'une transaction qui inscrit. */

const { app, admin, appDb } = pools();
let wakes = 0;
onTenantCommitWake(() => {
  wakes += 1;
});
afterAll(async () => {
  onTenantCommitWake(() => undefined);
  await app.end();
  await admin.end();
});

const org = randomUUID();
const job = (key: string) => ({
  organizationId: org,
  kind: "demo.reveil",
  idempotencyKey: `reveil:${key}`,
  runAt: new Date(),
});

describe("réveil du worker", () => {
  it("part après une inscription validée, jamais après une annulation ni sans tâche", async () => {
    await createOrganization(appDb, org, "Clinique du réveil", [
      {
        email: `rv-${org.slice(0, 8)}@essai.test`,
        displayName: "Dr Rémi Veil",
        role: "admin_vet",
      },
    ]);
    wakes = 0;
    await withTenant(appDb, { organizationId: org }, (tx) =>
      enqueue(tx, job("a")),
    );
    expect(wakes).toBe(1);

    await withTenant(appDb, { organizationId: org }, async () => undefined);
    expect(wakes).toBe(1);

    await expect(
      withTenant(appDb, { organizationId: org }, async (tx) => {
        await enqueue(tx, job("b"));
        throw new Error("annulée");
      }),
    ).rejects.toThrow("annulée");
    expect(wakes).toBe(1);

    // Inscription rejouée : la tâche existe déjà, aucun nouveau réveil.
    await withTenant(appDb, { organizationId: org }, (tx) =>
      enqueue(tx, job("a")),
    );
    expect(wakes).toBe(1);
  });
});
