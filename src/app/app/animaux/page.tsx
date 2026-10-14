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
      className: "bg-canvas-subtle text-ink-muted",
    };
  switch (row.openFollowup?.status) {
    case undefined:
    case "ended":
      return null;
    case "draft":
      return { label: text.draft, className: "bg-canvas-subtle text-ink" };
    case "paused":
      return {
        label: text.paused,
        className: "bg-canvas-subtle text-ink-muted",
      };
    case "human_takeover":
      return {
        label: text.takeover,
        className: "bg-brand-soft text-brand-ink",
      };
    case "active":
      return {
        label: text.followed,
        className: "bg-brand-soft text-brand-ink",
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
              className="border-b border-line px-5 py-3 text-sm font-medium text-ink-muted"
            >
              {text.count(rows.length)}
              {rows.length >= 200 ? ` · ${text.limitNote}` : ""}
            </p>
            <ul className="divide-y divide-line">
              {rows.map((row) => {
                const months = ageInMonths(row.birthDate, now);
                const status = badge(row, text.badges);
                return (
                  <li key={row.id}>
                    <Link
                      href={`/app/animaux/${row.id}`}
                      aria-label={text.openLabel(row.name)}
                      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 hover:bg-canvas-subtle focus-visible:bg-canvas-subtle"
                    >
                      <AnimalAvatar name={row.name} species={row.species} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {row.name}
                          <span className="font-normal text-ink-muted">
                            {" "}
                            · {t.labels.species[row.species]}
                            {row.breed ? ` · ${row.breed}` : ""}
                            {months !== null ? ` · ${text.age(months)}` : ""}
                          </span>
                        </p>
                        <p className="truncate text-sm text-ink-muted">
                          {row.owners.length
                            ? t.common.list(row.owners)
                            : text.noOwner}
                        </p>
                        {status ? (
                          <span
                            className={`mt-1.5 inline-flex rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${status.className}`}
                          >
                            {status.label}
                          </span>
                        ) : null}
                      </div>
                      <ChevronRight
                        aria-hidden="true"
                        className="size-4 text-ink-muted"
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
