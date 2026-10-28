import { ChevronRight, Lock, PawPrint, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { appText } from "@/i18n/app/server";
import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { Button, ButtonLink } from "@/ui/button";
import { Card } from "@/ui/card";
import { AnimalAvatar } from "@/ui/animal-avatar";
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

  return (
    <>
      <PageHeader
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
        <Card className="mb-8 rounded-[28px] border-white/70 bg-surface/75 p-3 shadow-[0_1px_2px_rgb(11_18_32/0.04),0_18px_40px_-24px_rgb(11_18_32/0.25)] sm:p-4 dark:border-line/80">
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
      <Card bare={followups.length > 0}>
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
          <ul className="grid grid-cols-1 gap-2.5">
            {followups.map((followup) => {
              const badge = followupBadge(followup);
              return (
                <li key={followup.id}>
                  <Link
                    href={`/app/suivis/${followup.id}`}
                    className={`group relative flex items-center gap-4 overflow-hidden rounded-[18px] border border-line/80 bg-surface/90 py-4 pr-5 pl-6 shadow-[0_1px_2px_rgb(11_18_32/0.04)] backdrop-blur transition-all duration-200 before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-r-full hover:-translate-y-0.5 hover:border-[var(--section-accent)]/30 hover:shadow-[0_14px_30px_-18px_rgb(11_18_32/0.35)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${badge === "urgent" ? "before:bg-urgent" : badge === "watch" ? "before:bg-watch" : "before:bg-[var(--section-accent)]/35"}`}
                  >
                    <AnimalAvatar
                      name={followup.animalName}
                      species={followup.species}
                    />
                    <span className="min-w-0 flex-1">
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
                          followup.access === "clinical"
                            ? followup.procedure
                            : null,
                          t.labels.followupStatus[followup.status],
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-right text-sm text-ink-muted sm:block">
                      <span className="block">{followup.responsibleName}</span>
                      <span className="block">
                        {followup.controlAppointmentAt
                          ? text.controlOn(
                              formatDate(followup.controlAppointmentAt, locale),
                            )
                          : text.controlNone}
                      </span>
                    </span>
                    <ChevronRight
                      aria-hidden="true"
                      className="size-4 shrink-0 text-ink-muted"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
