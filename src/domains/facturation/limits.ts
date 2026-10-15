import { subscriptions } from "@/server/db/schema";
import type { TenantTransaction } from "@/server/db/tenant";

import { maxAssistants, maxVets } from "./rules";

/** Limite de vétérinaires de la formule du cabinet (3 sans abonnement enregistré). */
export async function vetLimit(tx: TenantTransaction): Promise<number> {
  return maxVets(await currentPlan(tx));
}

/** Limite d'assistants de la formule ; null : sans limite. */
export async function assistantLimit(
  tx: TenantTransaction,
): Promise<number | null> {
  return maxAssistants(await currentPlan(tx));
}

/** Offre du cabinet ; null pour un cabinet antérieur aux abonnements. */
export async function currentPlan(tx: TenantTransaction) {
  const [row] = await tx
    .select({ plan: subscriptions.plan })
    .from(subscriptions);
  return row?.plan ?? null;
}
