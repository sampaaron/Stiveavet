import { ChevronRight, Lock, PawPrint, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { daysSince } from "@/domains/suivis/calendrier";
import { appText } from "@/i18n/app/server";
import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { Button, ButtonLink } from "@/ui/button";
import { Card } from "@/ui/card";
import { AnimalAvatar } from "@/ui/animal-avatar";
import { cn } from "@/ui/cn";
import { formatDate } from "@/ui/format";
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";
import { StatusBadge } from "@/ui/status-badge";

import { selectClasses } from "../action-message";

import { applyFollowupFilters, followupFilters } from "./filters";
import { followupBadge } from "./followup-labels";
import { TestMark } from "./test-mark";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.followups.title };
}

export default async function FollowupsPage({
  searchParams,
}: PageProps<"/app/suivis">) {
  const context = await requirePermission(
    "followups.read_all",
    "followups.read_own",
    "followups.read_summary",
  );
  const params = await searchParams;
  const filters = followupFilters.parse({
    query: params.q,
    status: params.statut,
    priority: params.priorite,
  });
  const all = await services.followups().list(context);
  const followups = applyFollowupFilters(all, filters);
  const filtered =
    filters.query !== "" ||
    filters.status !== "all" ||
    filters.priority !== "all";
  const clinical = context.permissions.has("clinical.read");
  const { t, locale } = await appText();
  const text = t.followups.list;
  const now = new Date();

  return (
    <>
      <PageHeader
        eyebrow={text.count(followups.length)}
        title={t.followups.title}
        description={
          clinical ? text.descriptionClinical : text.descriptionSummary
        }
        actions={
          context.permissions.has("followups.launch") && clinical ? (
            <ButtonLink
              href="/app/suivis/nouveau"
              icon={<PawPrint aria-hidden="true" className="size-4" />}
            >
              {text.launch}
            </ButtonLink>
          ) : null
        }
      />
      {all.length > 0 ? (
        <Card className="mb-6 p-4 sm:p-5">
          <form
            role="search"
            aria-label={text.filters.label}
            action="/app/suivis"
            className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-end"
          >
            <div className="flex min-w-0 flex-col gap-1.5">
              <label
                htmlFor="recherche-suivi"
                className="text-sm font-semibold"
              >
                {text.filters.search}
              </label>
              <input
                id="recherche-suivi"
                name="q"
                type="search"
                defaultValue={filters.query}
                maxLength={80}
                autoComplete="off"
                placeholder={
                  clinical
                    ? text.filters.placeholderClinical
                    : text.filters.placeholder
                }
                className="h-11 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[15px] text-ink placeholder:text-ink-muted focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="filtre-statut-suivi"
                className="text-sm font-semibold"
              >
                {text.filters.status}
              </label>
              <select
                id="filtre-statut-suivi"
                name="statut"
                defaultValue={filters.status}
                className={selectClasses}
              >
                <option value="all">{text.filters.statusAll}</option>
                <option value="ongoing">{text.filters.statusOngoing}</option>
                {(
                  [
                    "draft",
                    "active",
                    "paused",
                    "human_takeover",
                    "ended",
                  ] as const
                ).map((status) => (
                  <option key={status} value={status}>
                    {t.labels.followupStatus[status]}
                  </option>
                ))}
              </select>
            </div>
            {clinical ? (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="filtre-priorite"
                  className="text-sm font-semibold"
                >
                  {text.filters.priority}
                </label>
                <select
                  id="filtre-priorite"
                  name="priorite"
                  defaultValue={filters.priority}
                  className={selectClasses}
                >
                  <option value="all">{text.filters.priorityAll}</option>
                  <option value="urgent">{t.labels.triage.urgent}</option>
                  <option value="watch">{t.labels.triage.watch}</option>
                </select>
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button
                type="submit"
                icon={<Search aria-hidden="true" className="size-4" />}
              >
                {text.filters.apply}
              </Button>
              {filtered ? (
                <ButtonLink href="/app/suivis" variant="quiet">
                  {text.filters.reset}
                </ButtonLink>
              ) : null}
            </div>
          </form>
        </Card>
      ) : null}
      <Card>
        {followups.length === 0 ? (
          filtered ? (
            <EmptyState
              title={text.filters.noMatchTitle}
              description={text.filters.noMatchDescription}
            />
          ) : (
            <EmptyState
              title={text.emptyTitle}
              description={text.emptyDescription}
            />
          )
        ) : (
          <>
            <div
              aria-hidden="true"
              className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,1fr)_1rem] gap-4 border-b border-line px-5 py-3 tech-label text-ink-muted md:grid"
            >
              <span className="pl-14">{text.columns.patient}</span>
              <span>{text.columns.followup}</span>
              <span>{text.columns.responsible}</span>
              <span>{text.columns.control}</span>
            </div>
            <ul className="divide-y divide-line">
              {followups.map((followup) => {
                const badge = followupBadge(followup);
                const clinicalView =
                  followup.access === "clinical" ? followup : null;
                const day = clinicalView
                  ? daysSince(clinicalView.procedureAt, now)
                  : null;
                const span =
                  clinicalView && followup.controlAppointmentAt
                    ? daysSince(
                        clinicalView.procedureAt,
                        followup.controlAppointmentAt,
                      )
                    : null;
                const progress =
                  day !== null && span
                    ? Math.min(100, Math.round((day / span) * 100))
                    : null;
                return (
                  <li key={followup.id}>
                    <Link
                      href={`/app/suivis/${followup.id}`}
                      className={cn(
                        "relative grid grid-cols-[minmax(0,1fr)_1rem] items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,1fr)_1rem]",
                        // Liseré de gravité, doublé par le libellé du badge.
                        "before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full",
                        badge === "urgent"
                          ? "before:bg-urgent"
                          : badge === "watch"
                            ? "before:bg-watch"
                            : "before:bg-transparent",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-4">
                        <AnimalAvatar
                          name={followup.animalName}
                          species={followup.species}
                        />
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">
                              {followup.animalName}
                            </span>
                            {badge ? <StatusBadge status={badge} /> : null}
                            {followup.isPrivate ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted">
                                <Lock aria-hidden="true" className="size-3.5" />
                                {text.private}
                              </span>
                            ) : null}
                            {followup.isTest ? <TestMark /> : null}
                          </span>
                          <span className="mt-0.5 block truncate text-sm text-ink-muted">
                            {[
                              followup.ownerName,
                              t.labels.followupStatus[followup.status],
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                      </span>
                      <span className="col-start-1 min-w-0 pl-14 text-sm md:col-start-auto md:pl-0">
                        {clinicalView ? (
                          <>
                            <span className="flex items-baseline gap-2">
                              <span className="truncate">
                                {clinicalView.procedure}
                              </span>
                              {day !== null ? (
                                <span className="shrink-0 font-mono text-xs font-semibold text-brand-ink">
                                  {t.dashboard.dayLabel(day)}
                                </span>
                              ) : null}
                            </span>
                            {progress !== null ? (
                              <span
                                aria-hidden="true"
                                className="mt-1.5 block h-1 overflow-hidden rounded-full bg-canvas-subtle"
                              >
                                <span
                                  className="block h-full rounded-full bg-brand"
                                  style={{ width: `${Math.max(progress, 4)}%` }}
                                />
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-ink-muted">
                            {t.labels.followupStatus[followup.status]}
                          </span>
                        )}
                      </span>
                      <span className="hidden truncate text-sm md:block">
                        {followup.responsibleName}
                      </span>
                      <span className="col-start-1 pl-14 text-sm text-ink-muted tabular-nums md:col-start-auto md:pl-0">
                        {followup.controlAppointmentAt
                          ? text.controlOn(
                              formatDate(followup.controlAppointmentAt, locale),
                            )
                          : text.controlNone}
                      </span>
                      <ChevronRight
                        aria-hidden="true"
                        className="col-start-2 row-start-1 size-4 shrink-0 text-ink-muted md:col-start-auto md:row-start-auto"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
    </>
  );
}
