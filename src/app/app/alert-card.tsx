import Link from "next/link";

import type { AlertView } from "@/domains/urgences/service";
import { AlertBanner } from "@/ui/alert-banner";
import { formatDateTime, formatTime } from "@/ui/format";

import { AlertButtons } from "./alert-buttons";

const STATUS_LINE: Record<AlertView["status"], (alert: AlertView) => string> = {
  open: (alert) =>
    alert.level === "urgent" && alert.escalateAt
      ? `Prévenu : ${alert.targetName}. Sans accusé de réception, toute l'équipe vétérinaire sera alertée à ${formatTime(alert.escalateAt)}.`
      : `Prévenu : ${alert.targetName}.`,
  escalated: (alert) =>
    `Sans accusé de réception, toute l'équipe vétérinaire a été alertée${alert.escalatedAt ? ` à ${formatTime(alert.escalatedAt)}` : ""}.`,
  acknowledged: (alert) =>
    `Réception confirmée par ${alert.acknowledgedBy ?? "un vétérinaire"}${alert.acknowledgedAt ? ` à ${formatTime(alert.acknowledgedAt)}` : ""}. L'escalade est annulée.`,
  resolved: () => "Alerte close.",
};

/** Une alerte du triage : niveau, raison (accès clinique), état et actions de vétérinaire. */
export function AlertCard({
  alert,
  from,
}: {
  alert: AlertView;
  from: "alertes" | "dossier";
}) {
  const urgent = alert.level === "urgent";
  const pending = alert.status === "open" || alert.status === "escalated";
  const title = urgent
    ? pending
      ? `Urgence signalée à ${formatTime(alert.createdAt)}, sans accusé de réception`
      : `Urgence signalée à ${formatTime(alert.createdAt)}`
    : `À surveiller depuis ${formatTime(alert.createdAt)}`;
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
      <span className="block">{alert.reason}</span>
      <span className="mt-1 block">{STATUS_LINE[alert.status](alert)}</span>
      {from === "alertes" ? (
        <Link
          href={`/app/suivis/${alert.followupId}#conversation`}
          className="mt-1 inline-block font-semibold text-brand-ink underline-offset-2 hover:underline"
        >
          Ouvrir le dossier de {alert.animalName}
          <span className="sr-only"> ({formatDateTime(alert.createdAt)})</span>
        </Link>
      ) : null}
    </AlertBanner>
  );
}
