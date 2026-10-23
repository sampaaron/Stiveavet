import { AsyncLocalStorage } from "node:async_hooks";

import { sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { safeDbError } from "./errors";
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
 * Réveil du worker après validation (ADR 0028) : une transaction qui inscrit une tâche le
 * demande (`requestWake`), et le signal ne part qu'une fois la transaction validée.
 */
const pendingWake = new AsyncLocalStorage<{ wake: boolean }>();
let wakeHook: (() => void) | null = null;

export function onTenantCommitWake(hook: () => void) {
  wakeHook = hook;
}

export function requestWake() {
  const state = pendingWake.getStore();
  if (state) state.wake = true;
}

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
  const state = { wake: false };
  const result = await pendingWake
    .run(state, () => transaction(db, organizationId, userId, run))
    .catch((error: unknown) => {
      throw safeDbError(error);
    });
  if (state.wake) wakeHook?.();
  return result;
}

function transaction<T>(
  db: Database,
  organizationId: string,
  userId: string | undefined,
  run: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // Une seule instruction : un aller-retour de moins par transaction. Sans personne, la
    // chaîne vide vaut NULL pour `app.current_user_id()`.
    await tx.execute(
      sql`SELECT set_config('app.organization_id', ${organizationId}, true), set_config('app.user_id', ${userId ?? ""}, true)`,
    );
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

/**
 * Identifiants passés en un seul paramètre tableau (`colonne = ANY(…)`) : une liste longue
 * n'approche jamais la limite de 65 535 paramètres de PostgreSQL.
 */
export function uuidArray(ids: readonly string[]): SQL {
  return sql`${sql.param([...ids])}::uuid[]`;
}
