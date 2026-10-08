import { ArrowLeft, Search } from "lucide-react";
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
import { SpeciesIcon } from "@/ui/followup-card";
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
  const hits = query.length >= 2 ? await searchDrVeto(context, query) : [];
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
            title={hits.length ? text.found(hits.length) : text.noResults}
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
                    <span className="hidden size-10 place-items-center rounded-xl bg-canvas-subtle text-ink-muted sm:grid">
                      <SpeciesIcon
                        species={hit.species === "cat" ? "chat" : "chien"}
                      />
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
