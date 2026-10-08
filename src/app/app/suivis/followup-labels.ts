import type { FollowupView } from "@/domains/suivis/service";
import { fr } from "@/i18n/app/fr";
import type { Status } from "@/ui/status-badge";

/**
 * @deprecated Libellés français seulement : utiliser `t.labels.followupStatus` (dictionnaire
 * de l'espace cabinet). Conservé le temps que les derniers écrans passent au dictionnaire.
 */
export const FOLLOWUP_STATUS_LABELS: Record<FollowupView["status"], string> =
  fr.labels.followupStatus;

/**
 * @deprecated Libellés français seulement : utiliser `t.labels.species`. Conservé le temps que
 * les derniers écrans passent au dictionnaire.
 */
export const SPECIES_LABELS: Record<FollowupView["species"], string> =
  fr.labels.species;

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
