import { z } from "zod";

import { foldText } from "@/domains/commun/utilitaires";
import type { FollowupView } from "@/domains/suivis/service";

/** Filtres de la liste des suivis, lus dans l'adresse (valeur inconnue : pas de filtre). */
export const followupFilters = z.object({
  query: z.string().trim().max(80).catch(""),
  status: z
    .enum([
      "all",
      "ongoing",
      "draft",
      "active",
      "paused",
      "human_takeover",
      "ended",
    ])
    .catch("all"),
  priority: z.enum(["all", "urgent", "watch"]).catch("all"),
});

export type FollowupFilters = z.output<typeof followupFilters>;

const ONGOING = new Set(["active", "paused", "human_takeover"]);

/**
 * Applique les filtres aux suivis déjà autorisés. La priorité et l'intervention sont des
 * données cliniques : elles ne filtrent que les suivis lisibles à ce niveau.
 */
export function applyFollowupFilters(
  views: readonly FollowupView[],
  filters: FollowupFilters,
): FollowupView[] {
  const words = foldText(filters.query).split(/\s+/).filter(Boolean);
  return views.filter((view) => {
    if (
      filters.status === "ongoing"
        ? !ONGOING.has(view.status)
        : filters.status !== "all" && view.status !== filters.status
    )
      return false;
    if (
      filters.priority !== "all" &&
      (view.access !== "clinical" || view.triage !== filters.priority)
    )
      return false;
    if (!words.length) return true;
    const haystack = foldText(
      [
        view.animalName,
        view.ownerName ?? "",
        view.responsibleName,
        view.access === "clinical" ? view.procedure : "",
      ].join(" "),
    );
    return words.every((word) => haystack.includes(word));
  });
}
