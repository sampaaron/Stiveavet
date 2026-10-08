import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import type * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
export type TenantTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

export type TenantContext = { organizationId: string; userId?: string };

const contextSchema = z.object({
  organizationId: z.uuid(),
  userId: z.uuid().optional(),
});

/**
 * Seul point d'entrée vers les données métier : ouvre une transaction et y fixe le cabinet
 * (et la personne) courants. Les politiques RLS de PostgreSQL filtrent alors chaque requête ;
 * le réglage est local à la transaction et ne peut pas fuir vers une autre requête du pool.
 */
export async function withTenant<T>(
  db: Database,
  context: TenantContext,
  run: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  const { organizationId, userId } = contextSchema.parse(context);
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.organization_id', ${organizationId}, true)`,
    );
    if (userId)
      await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
    return run(tx);
  });
}

/** Transactions au nom d'un membre connecté : cabinet et personne fixés pour la RLS. */
export function tenantRunner(db: Database) {
  return <T>(
    member: { organizationId: string; userId: string },
    run: (tx: TenantTransaction) => Promise<T>,
  ) =>
    withTenant(
      db,
      { organizationId: member.organizationId, userId: member.userId },
      run,
    );
}
