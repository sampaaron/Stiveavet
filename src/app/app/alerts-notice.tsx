import type { AlertView } from "@/domains/urgences/service";
import { appText } from "@/i18n/app/server";
import { AlertBanner } from "@/ui/alert-banner";
import { ButtonLink } from "@/ui/button";

import { HiddenOn } from "./hidden-on";

/**
 * Notification dans l'application (ADR 0017). Le décompte des alertes sans accusé de
 * réception est toujours visible sur la cloche et dans la barre latérale ; ce bandeau ne
 * s'ajoute que pour une urgence, hors du tableau de bord et de l'écran Alertes qui la
 * montrent déjà. Aucun contenu clinique : un simple décompte.
 */
export async function AlertsNotice({
  alerts,
}: {
  alerts: readonly AlertView[];
}) {
  const pending = alerts.filter(
    (alert) => alert.status === "open" || alert.status === "escalated",
  );
  const urgent = pending.filter((alert) => alert.level === "urgent").length;
  if (!urgent) return null;
  const watch = pending.length - urgent;
  const { t } = await appText();
  const text = t.alerts.notice;
  return (
    <HiddenOn paths={["/app", "/app/alertes"]}>
      <div className="mb-5">
        <AlertBanner
          compact
          tone="urgent"
          title={text.pending(urgent, watch)}
          action={
            <ButtonLink href="/app/alertes" variant="secondary" size="sm">
              {text.view}
            </ButtonLink>
          }
        />
      </div>
    </HiddenOn>
  );
}
