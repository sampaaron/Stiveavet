import type { FollowupView } from "@/domains/suivis/service";
import type { Status } from "@/ui/status-badge";

/**
 * Badge d'un suivi. La priorité (normal, à surveiller, urgent) est une donnée clinique :
 * elle n'apparaît qu'aux personnes autorisées à la lire.
 */
export function followupBadge(view: FollowupView): Status | null {
  if (view.access === "clinical" && view.triage !== "normal")
    return view.triage;
  if (view.status === "paused") return "paused";
  if (view.access === "clinical") return "normal";
  return null;
}
