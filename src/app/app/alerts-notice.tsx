import type { AlertView } from "@/domains/urgences/service";
import { AlertBanner } from "@/ui/alert-banner";
import { ButtonLink } from "@/ui/button";

/**
 * Notification dans l'application (ADR 0017) : rappelle sur tout l'espace cabinet les
 * alertes encore sans accusé de réception. Aucun contenu clinique : un simple décompte.
 */
export function AlertsNotice({ alerts }: { alerts: readonly AlertView[] }) {
  const pending = alerts.filter(
    (alert) => alert.status === "open" || alert.status === "escalated",
  );
  if (!pending.length) return null;
  const urgent = pending.filter((alert) => alert.level === "urgent").length;
  const watch = pending.length - urgent;
  const parts = [
    urgent ? `${urgent} urgence${urgent > 1 ? "s" : ""}` : null,
    watch ? `${watch} alerte${watch > 1 ? "s" : ""} à surveiller` : null,
  ].filter(Boolean);
  return (
    <div className="mb-6">
      <AlertBanner
        tone={urgent ? "urgent" : "watch"}
        title={`${parts.join(" et ")} sans accusé de réception.`}
        action={
          <ButtonLink href="/app/alertes" variant="secondary" size="sm">
            Voir les alertes
          </ButtonLink>
        }
      />
    </div>
  );
}
