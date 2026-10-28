import { CalendarDays, MessageSquareText } from "lucide-react";
import Link from "next/link";

import type { DashboardFollowup } from "@/domains/suivis/tableau";
import type { FailedJobView } from "@/domains/taches/service";
import type { AlertView } from "@/domains/urgences/service";
import type { AppDictionary } from "@/i18n/app/types";
import type { Locale } from "@/i18n/locales";
import { AlertBanner } from "@/ui/alert-banner";
import { ButtonLink } from "@/ui/button";
import { SectionCard } from "@/ui/card";
import { formatDateTime, formatRelativeMoment } from "@/ui/format";
import { EmptyState } from "@/ui/states";

import { AlertCard } from "./alert-card";
import { JobActions } from "./taches/job-forms";
import { kindLabel } from "./taches/labels";

type Item =
  | { kind: "alert"; at: Date; rank: number; alert: AlertView }
  | { kind: "reply"; at: Date; rank: number; followup: DashboardFollowup }
  | { kind: "task"; at: Date; rank: number; job: FailedJobView };

/** Plafond de lignes affichées : au-delà, les pages Alertes et Automatisations. */
const MAX_ITEMS = 12;

/**
 * Ordre de la boîte : urgences sans accusé, urgences reçues, signes à surveiller sans accusé,
 * propriétaires qui attendent l'équipe, signes à surveiller reçus, puis tâches en échec.
 */
function alertRank(alert: AlertView): number {
  const pending = alert.status === "open" || alert.status === "escalated";
  if (alert.level === "urgent") return pending ? 0 : 1;
  return pending ? 2 : 4;
}

export function inboxItems(input: {
  alerts: AlertView[];
  followups: DashboardFollowup[];
  failures: FailedJobView[];
}): Item[] {
  const alerted = new Set(input.alerts.map((alert) => alert.followupId));
  return [
    ...input.alerts.map((alert) => ({
      kind: "alert" as const,
      at: alert.createdAt,
      rank: alertRank(alert),
      alert,
    })),
    ...input.followups
      .filter((followup) => followup.awaitingReply && !alerted.has(followup.id))
      .map((followup) => ({
        kind: "reply" as const,
        at: followup.lastActivityAt ?? followup.procedureAt,
        rank: 3,
        followup,
      })),
    ...input.failures.map((job) => ({
      kind: "task" as const,
      at: job.failedAt,
      rank: 5,
      job,
    })),
  ].sort((a, b) => a.rank - b.rank || b.at.getTime() - a.at.getTime());
}

/**
 * « À traiter » (ADR 0048) : une seule boîte pour ce qui demande une personne, triée par
 * urgence, chaque ligne avec l'action proposée. Rien n'y est décidé à la place de l'équipe.
 */
export function Inbox({
  t,
  locale,
  now,
  items,
  can,
}: {
  t: AppDictionary;
  locale: Locale;
  now: Date;
  items: Item[];
  can: { reply: boolean; agenda: boolean };
}) {
  const text = t.dashboard.inbox;
  const shown = items.slice(0, MAX_ITEMS);
  return (
    <SectionCard
      id="a-traiter"
      title={text.title(items.length)}
      description={text.description}
    >
      {items.length === 0 ? (
        <EmptyState
          title={text.emptyTitle}
          description={text.emptyDescription}
        />
      ) : (
        <ul aria-label={text.label} className="grid gap-3">
          {shown.map((item) => {
            if (item.kind === "alert") {
              const { alert } = item;
              const extra = (
                <>
                  {can.reply ? (
                    <ButtonLink
                      href={`/app/suivis/${alert.followupId}#conversation`}
                      variant="quiet"
                      size="sm"
                      icon={
                        <MessageSquareText
                          aria-hidden="true"
                          className="size-4"
                        />
                      }
                    >
                      {text.reply}
                      <span className="sr-only">
                        {t.dashboard.ready.forAnimal(alert.animalName)}
                      </span>
                    </ButtonLink>
                  ) : null}
                  {can.agenda ? (
                    <ButtonLink
                      href="/app/agenda"
                      variant="quiet"
                      size="sm"
                      icon={
                        <CalendarDays aria-hidden="true" className="size-4" />
                      }
                    >
                      {text.appointment}
                      <span className="sr-only">
                        {t.dashboard.ready.forAnimal(alert.animalName)}
                      </span>
                    </ButtonLink>
                  ) : null}
                </>
              );
              return (
                <li key={`alerte-${alert.id}`}>
                  <AlertCard alert={alert} from="accueil" extra={extra} />
                </li>
              );
            }
            if (item.kind === "reply") {
              const { followup } = item;
              return (
                <li key={`reponse-${followup.id}`}>
                  <AlertBanner
                    tone="info"
                    live={false}
                    title={text.awaiting(followup.animalName)}
                    action={
                      can.reply ? (
                        <ButtonLink
                          href={`/app/suivis/${followup.id}#conversation`}
                          size="sm"
                          icon={
                            <MessageSquareText
                              aria-hidden="true"
                              className="size-4"
                            />
                          }
                        >
                          {text.reply}
                          <span className="sr-only">
                            {t.dashboard.ready.forAnimal(followup.animalName)}
                          </span>
                        </ButtonLink>
                      ) : (
                        <ButtonLink
                          href={`/app/suivis/${followup.id}#conversation`}
                          variant="secondary"
                          size="sm"
                        >
                          {t.alerts.card.openFile(followup.animalName)}
                        </ButtonLink>
                      )
                    }
                  >
                    {text.awaitingSince(
                      formatRelativeMoment(item.at, now, locale),
                      followup.status === "paused",
                    )}
                  </AlertBanner>
                </li>
              );
            }
            const { job } = item;
            const label = kindLabel(t, job.kind);
            return (
              <li key={`tache-${job.id}`}>
                <AlertBanner
                  tone="watch"
                  live={false}
                  title={text.task(label)}
                  action={
                    <JobActions id={job.id} label={label} from="accueil" />
                  }
                >
                  <span className="block">{t.tasks.errors[job.errorCode]}</span>
                  <span className="mt-1 block text-ink-muted">
                    {t.tasks.attempts(
                      job.attempts,
                      formatDateTime(job.failedAt, locale),
                    )}
                  </span>
                  {job.followupId ? (
                    <Link
                      href={`/app/suivis/${job.followupId}`}
                      className="mt-1 inline-block font-semibold text-brand-ink underline-offset-2 hover:underline"
                    >
                      {t.tasks.openFile}
                    </Link>
                  ) : null}
                </AlertBanner>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > shown.length ? (
        <p className="mt-4 text-sm">
          <Link
            href="/app/alertes"
            className="font-semibold text-brand-ink underline-offset-2 hover:underline"
          >
            {text.more(items.length - shown.length)}
          </Link>
        </p>
      ) : null}
    </SectionCard>
  );
}
