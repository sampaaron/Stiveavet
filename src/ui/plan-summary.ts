import { PLAN_CATALOG } from "@/domains/facturation/rules";
import type { Plan } from "@/domains/facturation/rules";
import type { AppDictionary } from "@/i18n/app/types";

/** Ce que comprend une offre, en phrases courtes, à partir du catalogue. */
export function planHighlights(
  labels: AppDictionary["labels"],
  plan: Plan,
): string[] {
  const definition = PLAN_CATALOG[plan];
  const quota = labels.planQuota;
  return [
    quota.vets(definition.maxVets),
    quota.assistants(definition.maxAssistants),
    quota.followups(
      definition.includedActiveFollowups,
      definition.maxActiveFollowups,
    ),
    labels.plans[plan].stive,
    ...(definition.advancedIntegrations ? [quota.integrations] : []),
  ];
}
