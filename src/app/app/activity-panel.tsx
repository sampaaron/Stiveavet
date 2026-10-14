import { ArrowRight } from "lucide-react";
import Link from "next/link";

import type { ActivityStats } from "@/domains/suivis/statistiques";
import type { AppDictionary } from "@/i18n/app/types";
import type { Locale } from "@/i18n/locales";
import { SectionCard, StatCard } from "@/ui/card";
import { formatMinutes } from "@/ui/format";

const INTL: Record<Locale, string> = { fr: "fr-FR", en: "en-GB" };

function shortDay(day: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL[locale], {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}

/** Totaux du cabinet sur 30 jours et messages des 14 derniers jours. */
export function ActivityPanel({
  stats,
  t,
  locale,
}: {
  stats: ActivityStats;
  t: AppDictionary;
  locale: Locale;
}) {
  const text = t.dashboard.activity;
  const rate = stats.response.launched
    ? Math.round((stats.response.answered / stats.response.launched) * 100)
    : null;
  const peak = Math.max(
    1,
    ...stats.daily.map((entry) => entry.inbound + entry.outbound),
  );
  return (
    <SectionCard title={text.title} description={text.description}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={text.launched}
          value={stats.launched}
          hint={text.launchedHint(stats.ongoing)}
        />
        <StatCard
          label={text.messages}
          value={stats.ownerMessages}
          hint={text.messagesHint(stats.outboundMessages)}
        />
        <StatCard
          label={text.response}
          value={rate === null ? "—" : `${rate} %`}
          tone="brand"
          hint={
            rate === null
              ? text.responseNone
              : text.responseHint(
                  stats.response.answered,
                  stats.response.launched,
                )
          }
        />
        <StatCard
          label={text.alerts}
          value={stats.alerts.created}
          hint={
            stats.medianAckMinutes === null
              ? text.alertsHint(stats.alerts.open)
              : text.medianAck(formatMinutes(stats.medianAckMinutes, locale))
          }
        />
      </div>

      <figure className="mt-6">
        <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-semibold">{text.chartTitle}</span>
          <span className="flex gap-4 text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-sm bg-brand"
              />
              {text.inbound}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-sm bg-brand-soft ring-1 ring-brand/30"
              />
              {text.outbound}
            </span>
          </span>
        </figcaption>
        <div aria-hidden="true" className="flex h-28 items-end gap-1.5">
          {stats.daily.map((entry) => (
            <div
              key={entry.day}
              className="flex h-full min-w-0 flex-1 flex-col justify-end gap-px"
              title={text.chartRow(
                shortDay(entry.day, locale),
                entry.inbound,
                entry.outbound,
              )}
            >
              <div
                className="rounded-t-sm bg-brand-soft ring-1 ring-brand/30"
                style={{ height: `${(entry.outbound / peak) * 100}%` }}
              />
              <div
                className="rounded-b-sm bg-brand"
                style={{ height: `${(entry.inbound / peak) * 100}%` }}
              />
            </div>
          ))}
        </div>
        <div
          aria-hidden="true"
          className="mt-1.5 flex justify-between text-xs text-ink-muted"
        >
          <span>
            {stats.daily[0] ? shortDay(stats.daily[0].day, locale) : ""}
          </span>
          <span>
            {stats.daily.at(-1)
              ? shortDay(stats.daily.at(-1)?.day ?? "", locale)
              : ""}
          </span>
        </div>
        <ul className="sr-only">
          {stats.daily.map((entry) => (
            <li key={entry.day}>
              {text.chartRow(
                shortDay(entry.day, locale),
                entry.inbound,
                entry.outbound,
              )}
            </li>
          ))}
        </ul>
      </figure>
    </SectionCard>
  );
}

/** Ce qui attend le cabinet, avec un lien vers l'écran où le faire. */
export function NextActions({
  stats,
  t,
  links,
}: {
  stats: ActivityStats;
  t: AppDictionary;
  /** Liens autorisés pour la personne ; sans lien, la ligne n'apparaît pas. */
  links: { followups: boolean; alerts: boolean };
}) {
  const text = t.dashboard.next;
  const items = [
    links.alerts && stats.alerts.unacknowledged > 0
      ? {
          href: "/app/alertes",
          label: text.unacknowledged(stats.alerts.unacknowledged),
          urgent: true,
        }
      : null,
    links.followups && stats.next.drafts > 0
      ? {
          href: "/app/suivis?statut=draft",
          label: text.drafts(stats.next.drafts),
          urgent: false,
        }
      : null,
    links.followups && stats.next.consentPending > 0
      ? {
          href: "/app/suivis?statut=active",
          label: text.consent(stats.next.consentPending),
          urgent: false,
        }
      : null,
    links.followups && stats.next.controlsThisWeek > 0
      ? {
          href: "/app/suivis",
          label: text.controls(stats.next.controlsThisWeek),
          urgent: false,
        }
      : null,
  ].filter((item) => item !== null);
  return (
    <SectionCard title={text.title}>
      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">{text.none}</p>
      ) : (
        <ul className="-mx-2 grid">
          {items.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] px-2 py-2 text-sm font-medium hover:bg-canvas-subtle"
              >
                <span className={item.urgent ? "text-urgent" : undefined}>
                  {item.label}
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 text-ink-muted"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
