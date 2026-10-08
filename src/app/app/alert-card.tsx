import Link from "next/link";

import type { AlertView } from "@/domains/urgences/service";
import { appText } from "@/i18n/app/server";
import type { AppDictionary } from "@/i18n/app/types";
import type { Locale } from "@/i18n/locales";
import { AlertBanner } from "@/ui/alert-banner";
import { formatDateTime, formatTime } from "@/ui/format";

import { AlertButtons } from "./alert-buttons";
import { triageReasonText } from "./triage-reason";

/** État de l'alerte : qui est prévenu, l'escalade, l'accusé de réception. */
function statusLine(
  t: AppDictionary,
  locale: Locale,
  alert: AlertView,
): string {
  const text = t.alerts.status;
  const time = (value: Date | null | undefined) =>
    value ? formatTime(value, locale) : null;
  switch (alert.status) {
    case "open":
      return alert.level === "urgent" && alert.escalateAt
        ? text.openEscalating(
            alert.targetName,
            formatTime(alert.escalateAt, locale),
          )
        : text.open(alert.targetName);
    case "escalated":
      return text.escalated(time(alert.escalatedAt));
    case "acknowledged":
      return text.acknowledged(
        alert.acknowledgedBy ?? null,
        time(alert.acknowledgedAt),
      );
    case "resolved":
      return text.resolved;
  }
}

/** Une alerte du triage : niveau, raison (accès clinique), état et actions de vétérinaire. */
export async function AlertCard({
  alert,
  from,
}: {
  alert: AlertView;
  from: "alertes" | "dossier";
}) {
  const { t, locale } = await appText();
  const text = t.alerts.card;
  const urgent = alert.level === "urgent";
  const pending = alert.status === "open" || alert.status === "escalated";
  const createdAt = formatTime(alert.createdAt, locale);
  const title = urgent
    ? pending
      ? text.urgentPending(createdAt)
      : text.urgent(createdAt)
    : text.watch(createdAt);
  return (
    <AlertBanner
      tone={pending ? (urgent ? "urgent" : "watch") : "success"}
      title={from === "alertes" ? `${alert.animalName} · ${title}` : title}
      action={
        alert.canAcknowledge ? (
          <AlertButtons
            alertId={alert.id}
            from={from}
            canAcknowledge={pending}
          />
        ) : undefined
      }
    >
      <span className="block">{triageReasonText(t, alert.reason)}</span>
      <span className="mt-1 block">{statusLine(t, locale, alert)}</span>
      {from === "alertes" ? (
        <Link
          href={`/app/suivis/${alert.followupId}#conversation`}
          className="mt-1 inline-block font-semibold text-brand-ink underline-offset-2 hover:underline"
        >
          {text.openFile(alert.animalName)}
          <span className="sr-only">
            {" "}
            ({formatDateTime(alert.createdAt, locale)})
          </span>
        </Link>
      ) : null}
    </AlertBanner>
  );
}
