import { ArrowLeft, ChevronRight, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DomainError } from "@/domains/equipe/actor";
import type { DrVetoSearchHit } from "@/domains/suivis/lancement";
import { appText } from "@/i18n/app/server";
import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { AlertBanner } from "@/ui/alert-banner";
import { Button, ButtonLink } from "@/ui/button";
import { Card, SectionCard } from "@/ui/card";
import { AnimalAvatar } from "@/ui/animal-avatar";
import { formatDateTime } from "@/ui/format";
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";

import { PrepareForm } from "./prepare-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.followups.create.title };
}

/** Recherche dr.veto : `null` si la connexion n'est pas faite. */
async function searchDrVeto(
  context: Awaited<ReturnType<typeof requirePermission>>,
  query: string,
): Promise<DrVetoSearchHit[] | null> {
  try {
    return await services.launch().search(context, query);
  } catch (error) {
    if (error instanceof DomainError && error.code === "integration_missing")
      return null;
    throw error;
  }
}

export default async function NewFollowupPage({
  searchParams,
}: PageProps<"/app/suivis/nouveau">) {
  const context = await requirePermission("followups.launch");
  // L'import montre allergies, antécédents et traitements : données cliniques.
  if (!context.permissions.has("clinical.read")) notFound();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, 80) : "";
  const [hits, registry, drafts] = await Promise.all([
    query.length >= 2 ? searchDrVeto(context, query) : [],
    query.length >= 2
      ? services.patients().list(context, { query, status: "active" })
      : [],
    query.length >= 2
      ? []
      : services
          .followups()
          .list(context)
          .then((views) => views.filter((view) => view.status === "draft")),
  ]);
  const { t, locale } = await appText();
  const text = t.followups.create;

  return (
    <>
      <Link
        href="/app/suivis"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {text.back}
      </Link>
      <PageHeader title={text.title} description={text.description} />

      <div className="grid gap-6">
        <Card className="p-5 sm:p-6">
          <form
            role="search"
            action="/app/suivis/nouveau"
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <label
                htmlFor="recherche-drveto"
                className="text-sm font-semibold"
              >
                {text.searchLabel}
              </label>
              <input
                id="recherche-drveto"
                name="q"
                type="search"
                defaultValue={query}
                minLength={2}
                maxLength={80}
                autoComplete="off"
                className="h-11 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[15px] text-ink placeholder:text-ink-muted focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
                placeholder={text.searchPlaceholder}
              />
            </div>
            <Button
              type="submit"
              icon={<Search aria-hidden="true" className="size-4" />}
            >
              {text.search}
            </Button>
          </form>
          <p className="mt-3 text-xs text-ink-muted">{text.simulatedNote}</p>
        </Card>

        {query.length >= 2 ? (
          <SectionCard
            title={text.registryTitle}
            action={
              <ButtonLink
                href="/app/animaux/nouveau"
                variant="secondary"
                size="sm"
                icon={<Plus aria-hidden="true" className="size-3.5" />}
              >
                {text.newAnimal}
              </ButtonLink>
            }
          >
            {registry.length === 0 ? (
              <p className="text-sm text-ink-muted">{text.registryEmpty}</p>
            ) : (
              <ul className="-mx-2 grid">
                {registry.slice(0, 8).map((animal) => (
                  <li key={animal.id}>
                    <Link
                      href={
                        animal.openFollowup?.visible
                          ? `/app/suivis/${animal.openFollowup.id}`
                          : `/app/animaux/${animal.id}`
                      }
                      className="flex items-center gap-3 rounded-[var(--radius-control)] px-2 py-2.5 hover:bg-canvas-subtle"
                    >
                      <AnimalAvatar
                        name={animal.name}
                        species={animal.species}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {animal.name}
                          <span className="font-normal text-ink-muted">
                            {" "}
                            · {t.labels.species[animal.species]}
                          </span>
                        </span>
                        <span className="block truncate text-sm text-ink-muted">
                          {t.common.list(animal.owners)}
                        </span>
                      </span>
                      <span className="text-sm font-semibold text-brand-ink">
                        {animal.openFollowup
                          ? text.alreadyOpen
                          : text.launchFromRegistry}
                      </span>
                      <ChevronRight
                        aria-hidden="true"
                        className="size-4 text-ink-muted"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <SectionCard title={text.draftsTitle}>
              {drafts.length === 0 ? (
                <p className="text-sm text-ink-muted">{text.draftsEmpty}</p>
              ) : (
                <ul className="-mx-2 grid">
                  {drafts.map((draft) => (
                    <li key={draft.id}>
                      <Link
                        href={`/app/suivis/${draft.id}/lancement`}
                        className="flex items-center gap-3 rounded-[var(--radius-control)] px-2 py-2.5 hover:bg-canvas-subtle"
                      >
                        <AnimalAvatar
                          name={draft.animalName}
                          species={draft.species}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">
                            {draft.animalName}
                          </span>
                          <span className="block truncate text-sm text-ink-muted">
                            {draft.access === "clinical"
                              ? draft.procedure
                              : draft.responsibleName}
                          </span>
                        </span>
                        <ChevronRight
                          aria-hidden="true"
                          className="size-4 text-ink-muted"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
            <SectionCard
              title={text.newAnimalTitle}
              description={text.newAnimalBody}
            >
              <ButtonLink
                href="/app/animaux/nouveau"
                icon={<Plus aria-hidden="true" className="size-4" />}
              >
                {text.newAnimal}
              </ButtonLink>
            </SectionCard>
          </div>
        )}

        {hits === null ? (
          <AlertBanner
            tone="watch"
            title={text.notConnectedTitle}
            action={
              <ButtonLink href="/app/reglages" variant="secondary" size="sm">
                {text.openSettings}
              </ButtonLink>
            }
          >
            {text.notConnectedBody}
          </AlertBanner>
        ) : query.length >= 2 ? (
          <SectionCard
            title={text.drvetoTitle}
            description={hits.length ? text.found(hits.length) : text.noResults}
          >
            {hits.length === 0 ? (
              <EmptyState
                title={text.noMatchTitle}
                description={text.noMatchDescription}
              />
            ) : (
              <ul className="divide-y divide-line">
                {hits.map((hit) => (
                  <li
                    key={hit.ref}
                    className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
                  >
                    <span className="hidden sm:block">
                      <AnimalAvatar name={hit.name} species={hit.species} />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {hit.name}
                        <span className="font-normal text-ink-muted">
                          {" "}
                          · {t.labels.species[hit.species]}
                          {hit.breed ? ` · ${hit.breed}` : ""}
                        </span>
                      </p>
                      <p className="text-sm text-ink-muted">
                        {t.common.list(hit.ownerNames)}
                      </p>
                      <p className="text-sm text-ink-muted">
                        {hit.lastProcedure} ·{" "}
                        {formatDateTime(hit.lastProcedureAt, locale)} ·{" "}
                        {hit.ref}
                      </p>
                    </div>
                    {hit.openFollowupId ? (
                      <ButtonLink
                        href={`/app/suivis/${hit.openFollowupId}`}
                        variant="secondary"
                        size="sm"
                        aria-label={text.openFollowupLabel(hit.name)}
                      >
                        {text.alreadyOpen}
                      </ButtonLink>
                    ) : (
                      <PrepareForm drVetoRef={hit.ref} animalName={hit.name} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        ) : null}
      </div>
    </>
  );
}
