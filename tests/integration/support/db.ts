import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { PoolClient } from "pg";
import { inject } from "vitest";

import * as schema from "@/server/db/schema";

export const TENANT_TABLES = [
  "memberships",
  "animals",
  "owners",
  "owner_contacts",
  "animal_owners",
  "followups",
  "followup_shares",
  "audit_events",
  "login_events",
] as const;

export function pools() {
  const app = new Pool({ connectionString: inject("appUrl"), max: 1 });
  const admin = new Pool({ connectionString: inject("adminUrl"), max: 1 });
  return { app, admin, appDb: drizzle(app, { schema }) };
}

/** Exécute `run` en tant que stivea_app dans une transaction annulée à la fin, cabinet fixé. */
export async function asApp<T>(
  pool: Pool,
  organizationId: string | null,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (organizationId)
      await client.query("SELECT set_config('app.organization_id', $1, true)", [
        organizationId,
      ]);
    return await run(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

/** Code d'erreur PostgreSQL d'une promesse rejetée (42501 : droit refusé / RLS, 23503 : clé étrangère). */
export async function errorCode(
  promise: Promise<unknown>,
): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}
