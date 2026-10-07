import { subscriptions } from "@/server/db/schema";
import type { TenantTransaction } from "@/server/db/tenant";

import { maxVets } from "./rules";

/** Limite de vétérinaires de la formule du cabinet (3 sans abonnement enregistré). */
export async function vetLimit(tx: TenantTransaction): Promise<number> {
  const [row] = await tx
    .select({ plan: subscriptions.plan })
    .from(subscriptions);
  return maxVets(row?.plan ?? null);
}
