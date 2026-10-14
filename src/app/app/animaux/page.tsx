import { ChevronRight, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ageInMonths, registryFilters } from "@/domains/patients/content";
import type { RegistryRow } from "@/domains/patients/service";
import { appText } from "@/i18n/app/server";
import type { AppDictionary } from "@/i18n/app/types";
import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { AnimalAvatar } from "@/ui/animal-avatar";
import { Button, ButtonLink } from "@/ui/button";
import { Card } from "@/ui/card";
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";

import { selectClasses } from "../action-message";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.patients.title };
}

function badge(row: RegistryRow, text: AppDictionary["patients"]["badges"]) {
  if (row.archived)
    return {
      label: text.archived,
      className: "border-line bg-canvas-subtle text-ink-muted",
    };
  switch (row.openFollowup?.status) {
    case undefined:
    case "ended":
      return null;
    case "draft":
      return {
        label: text.draft,
        className: "border-line bg-canvas-subtle text-ink",
      };
    case "paused":
      return {
        label: text.paused,
        className: "border-line bg-canvas-subtle text-ink-muted",
      };
    case "human_takeover":
      return {
        label: text.takeover,
        className: "border-brand/25 bg-brand-soft text-brand-ink",
      };
    case "active":
      return {
        label: text.followed,
        className: "border-brand/25 bg-brand-soft text-brand-ink",
      };
  }
}

export default async function AnimalsPage({
  searchParams,
}: PageProps<"/app/animaux">) {
  const context = await requirePermission("followups.launch");
  const params = await searchParams;
  const filters = registryFilters.parse({
    query: params.q,
    species: params.espece,
    status: params.statut,
  });
  const rows = await services.patients().list(context, filters);
  const { t } = await appText();
  const text = t.patients;
  const now = new Date();
  const filtered =
    filters.query !== "" ||
    filters.species !== "all" ||
    filters.status !== "active";

  return (
    <>
      <PageHeader
        title={text.title}
        description={text.description}
        actions={
          <ButtonLink
            href="/app/animaux/nouveau"
            icon={<Plus aria-hidden="true" className="size-4" />}
          >
            {text.add}
          </ButtonLink>
        }
      />

      <Card className="mb-6 p-4 sm:p-5">
        <form
          role="search"
          aria-label={text.filters.label}
          action="/app/animaux"
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-end"
        >
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="recherche-animal" className="text-sm font-semibold">
              {text.filters.search}
            </label>
            <input
              id="recherche-animal"
              name="q"
              type="search"
              defaultValue={filters.query}
              maxLength={80}
              autoComplete="off"
              placeholder={text.filters.searchPlaceholder}
              className="h-11 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[15px] text-ink placeholder:text-ink-muted focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="filtre-espece" className="text-sm font-semibold">
              {text.filters.species}
            </label>
            <select
              id="filtre-espece"
              name="espece"
              defaultValue={filters.species}
              className={selectClasses}
            >
              <option value="all">{text.filters.speciesAll}</option>
              <option value="dog">{t.labels.species.dog}</option>
              <option value="cat">{t.labels.species.cat}</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="filtre-statut" className="text-sm font-semibold">
              {text.filters.status}
            </label>
            <select
              id="filtre-statut"
              name="statut"
              defaultValue={filters.status}
              className={selectClasses}
            >
              <option value="active">{text.filters.statusActive}</option>
              <option value="followed">{text.filters.statusFollowed}</option>
              <option value="archived">{text.filters.statusArchived}</option>
              <option value="all">{text.filters.statusAll}</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button
              type="submit"
              icon={<Search aria-hidden="true" className="size-4" />}
            >
              {text.filters.apply}
            </Button>
            {filtered ? (
              <ButtonLink href="/app/animaux" variant="quiet">
                {text.filters.reset}
              </ButtonLink>
            ) : null}
          </div>
        </form>
      </Card>

      <Card>
        {rows.length === 0 ? (
          filtered ? (
            <EmptyState
              title={text.noMatchTitle}
              description={text.noMatchDescription}
            />
          ) : (
            <EmptyState
              title={text.emptyTitle}
              description={text.emptyDescription}
              action={
                <ButtonLink href="/app/animaux/nouveau">{text.add}</ButtonLink>
              }
            />
          )
        ) : (
          <>
            <p
              role="status"
              className="border-b border-line px-5 py-3 overline text-ink-muted"
            >
              {text.count(rows.length)}
              {rows.length >= 200 ? ` · ${text.limitNote}` : ""}
            </p>
            <div
              aria-hidden="true"
              className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,1.4fr)_minmax(0,1fr)_1rem] gap-4 border-b border-line bg-canvas px-5 py-2 text-ink-muted md:grid"
            >
              <span className="overline">{text.columns.patient}</span>
              <span className="overline">{text.columns.details}</span>
              <span className="overline">{text.columns.owners}</span>
              <span className="overline">{text.columns.status}</span>
            </div>
            <ul className="divide-y divide-line">
              {rows.map((row) => {
                const months = ageInMonths(row.birthDate, now);
                const status = badge(row, text.badges);
                return (
                  <li key={row.id}>
                    <Link
                      href={`/app/animaux/${row.id}`}
                      aria-label={text.openLabel(row.name)}
                      className="grid grid-cols-[minmax(0,1fr)_1rem] items-center gap-x-4 gap-y-1.5 px-5 py-3.5 transition-colors hover:bg-canvas focus-visible:bg-canvas md:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,1.4fr)_minmax(0,1fr)_1rem]"
                    >
                      <span className="flex min-w-0 items-center gap-4">
                        <AnimalAvatar name={row.name} species={row.species} />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">
                            {row.name}
                          </span>
                          <span className="block truncate text-sm text-ink-muted md:hidden">
                            {row.owners.length
                              ? t.common.list(row.owners)
                              : text.noOwner}
                          </span>
                        </span>
                      </span>
                      <span className="col-start-1 min-w-0 truncate pl-14 text-sm text-ink-muted md:col-start-auto md:pl-0">
                        {t.labels.species[row.species]}
                        {row.breed ? ` · ${row.breed}` : ""}
                        {months !== null ? (
                          <span className="font-mono text-xs text-ink">
                            {" "}
                            · {text.age(months)}
                          </span>
                        ) : null}
                      </span>
                      <span className="hidden min-w-0 truncate text-sm md:block">
                        {row.owners.length
                          ? t.common.list(row.owners)
                          : text.noOwner}
                      </span>
                      <span
                        className={`col-start-1 pl-14 md:col-start-auto md:block md:pl-0 ${status ? "" : "hidden"}`}
                      >
                        {status ? (
                          <span
                            className={`inline-flex rounded-md border px-2 py-0.5 text-[12.5px] font-semibold ${status.className}`}
                          >
                            {status.label}
                          </span>
                        ) : (
                          <span className="font-mono text-xs text-ink-muted">
                            —
                          </span>
                        )}
                      </span>
                      <ChevronRight
                        aria-hidden="true"
                        className="col-start-2 row-start-1 size-4 text-ink-muted md:col-start-auto md:row-start-auto"
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
