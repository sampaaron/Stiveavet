import type { AlertView } from "@/domains/urgences/service";
import { appText } from "@/i18n/app/server";
import { AlertBanner } from "@/ui/alert-banner";
import { ButtonLink } from "@/ui/button";

/**
 * Notification dans l'application (ADR 0017) : rappelle sur tout l'espace cabinet les
 * alertes encore sans accusé de réception. Aucun contenu clinique : un simple décompte.
 */
export async function AlertsNotice({
  alerts,
}: {
  alerts: readonly AlertView[];
}) {
  const pending = alerts.filter(
    (alert) => alert.status === "open" || alert.status === "escalated",
  );
  if (!pending.length) return null;
  const urgent = pending.filter((alert) => alert.level === "urgent").length;
  const watch = pending.length - urgent;
  const { t } = await appText();
  const text = t.alerts.notice;
  return (
    <div className="mb-6">
      <AlertBanner
        tone={urgent ? "urgent" : "watch"}
        title={text.pending(urgent, watch)}
        action={
          <ButtonLink href="/app/alertes" variant="secondary" size="sm">
            {text.view}
          </ButtonLink>
        }
      />
    </div>
  );
}
