import { subscriptions } from "@/server/db/schema";
import type { TenantTransaction } from "@/server/db/tenant";

import type { SubscriptionFacts } from "./rules";

/** Faits de l'abonnement du cabinet courant ; `lock` le verrouille jusqu'à la fin de la transaction. */
export async function loadFacts(
  tx: TenantTransaction,
  lock = false,
): Promise<SubscriptionFacts | null> {
  const query = tx.select().from(subscriptions);
  const [row] = lock ? await query.for("update") : await query;
  if (!row) return null;
  return {
    plan: row.plan,
    cycle: row.cycle,
    startedAt: row.startedAt,
    cycleChosenAt: row.cycleChosenAt,
    annualEndsAt: row.annualEndsAt,
    unpaidSince: row.unpaidSince,
    canceledAt: row.canceledAt,
    endsAt: row.endsAt,
  };
}
