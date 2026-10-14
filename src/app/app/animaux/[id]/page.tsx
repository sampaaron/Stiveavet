import { ArrowLeft, ChevronRight, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DomainError } from "@/domains/equipe/actor";
import { ageInMonths } from "@/domains/patients/content";
import { maskPhone } from "@/domains/whatsapp/numero";
import { appText } from "@/i18n/app/server";
import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { AlertBanner } from "@/ui/alert-banner";
import { ButtonLink } from "@/ui/button";
import { SectionCard } from "@/ui/card";
import { formatDate, formatDateTime, toDateTimeInput } from "@/ui/format";
import { PatientHeader } from "@/ui/patient-header";
import { EmptyState } from "@/ui/states";

import { AnimalStatusButtons, LaunchFromAnimalForm } from "../record-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.patients.title };
}

export default async function AnimalPage({
  params,
}: PageProps<"/app/animaux/[id]">) {
  const context = await requirePermission("followups.launch");
  const { id } = await params;
  const record = await services
    .patients()
    .get(context, id)
    .catch((error: unknown) => {
      if (error instanceof DomainError && error.code === "not_found")
        notFound();
      throw error;
    });
  const canPrepare = context.permissions.has("clinical.read");
  const protocols =
    canPrepare && !record.archivedAt && !record.openFollowupId
      ? await services.launch().protocolOptions(context, record.species)
      : [];
  const { t, locale } = await appText();
  const text = t.patients.record;
  const now = new Date();
  const months = ageInMonths(record.birthDate, now);
  const facts: [string, string][] = [
    [text.species, t.labels.species[record.species]],
    [text.breed, record.breed ?? text.unknown],
    [
      text.sex,
      [
        record.sex ? t.patients.sex[record.sex] : null,
        record.neutered === null
          ? null
          : t.patients.neutered[record.neutered ? "yes" : "no"],
      ]
        .filter(Boolean)
        .join(" · ") || text.unknown,
    ],
    [
      text.age,
      months === null
        ? text.unknown
        : `${t.patients.age(months)} · ${text.birthDate} ${formatDate(new Date(`${record.birthDate}T12:00:00Z`), locale)}`,
    ],
    [
      text.weight,
      record.weightGrams === null
        ? text.unknown
        : text.weightValue(
            (record.weightGrams / 1000).toLocaleString(locale, {
              maximumFractionDigits: 2,
            }),
          ),
    ],
    [text.registered, formatDate(record.createdAt, locale)],
  ];
  if (record.externalRef) facts.push([text.drveto, record.externalRef]);

  return (
    <>
      <Link
        href="/app/animaux"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {text.back}
      </Link>

      <PatientHeader
        name={record.name}
        species={record.species}
        subtitle={
          record.owners.length
            ? t.common.list(record.owners.map((owner) => owner.fullName))
            : undefined
        }
        actions={
          <>
            {record.archivedAt ? null : (
              <ButtonLink
                href={`/app/animaux/${record.id}/modifier`}
                variant="secondary"
                size="sm"
                icon={<Pencil aria-hidden="true" className="size-3.5" />}
              >
                {text.edit}
              </ButtonLink>
            )}
            <AnimalStatusButtons
              animalId={record.id}
              animalName={record.name}
              archived={record.archivedAt !== null}
              canDelete={record.canDelete}
            />
          </>
        }
        vitals={facts.map(([label, value]) => ({
          label,
          value,
          mono: label === text.weight || label === text.registered,
        }))}
      />

      {record.archivedAt ? (
        <div className="mb-6">
          <AlertBanner tone="watch" title={text.archivedTitle}>
            {text.archivedBody}
          </AlertBanner>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="grid min-w-0 grid-cols-1 content-start gap-6">
          <SectionCard title={text.owners}>
            <ul className="grid gap-4">
              {record.owners.map((owner, index) => (
                <li key={owner.id} className="grid gap-0.5 text-sm">
                  <p className="font-semibold">
                    {owner.fullName}
                    {index === 0 && record.owners.length > 1 ? (
                      <span className="ml-2 rounded-full bg-canvas-subtle px-2 py-0.5 text-xs font-semibold text-ink-muted">
                        {text.primary}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-ink-muted">
                    {owner.phone ? maskPhone(owner.phone) : text.unknown}
                    {owner.email ? ` · ${owner.email}` : ""}
                  </p>
                  <p className="text-ink-muted">
                    {text.language} :{" "}
                    {t.patients.form.languages[owner.language]}
                  </p>
                </li>
              ))}
            </ul>
          </SectionCard>

          {canPrepare || record.notesHidden ? (
            <SectionCard title={text.notes}>
              <p className="text-sm whitespace-pre-line text-ink">
                {record.notesHidden
                  ? text.notesHidden
                  : (record.notes ?? text.notesEmpty)}
              </p>
            </SectionCard>
          ) : null}
        </div>

        <div className="grid min-w-0 grid-cols-1 content-start gap-6">
          {record.archivedAt ? null : record.openFollowupId ? (
            <SectionCard
              title={t.patients.launch.openTitle}
              description={t.patients.launch.openBody}
            >
              <ButtonLink href={`/app/suivis/${record.openFollowupId}`}>
                {t.patients.launch.openAction}
              </ButtonLink>
            </SectionCard>
          ) : canPrepare ? (
            <SectionCard
              title={t.patients.launch.title}
              description={t.patients.launch.description}
            >
              <LaunchFromAnimalForm
                animalId={record.id}
                defaultProcedureAt={toDateTimeInput(now)}
                protocols={protocols}
              />
            </SectionCard>
          ) : (
            <AlertBanner tone="watch" title={t.patients.launch.noRights} />
          )}

          <SectionCard title={text.history}>
            {record.history.length === 0 ? (
              <EmptyState title={text.historyEmpty} />
            ) : (
              <ul className="divide-y divide-line">
                {record.history.map((entry) => {
                  const title =
                    entry.access === "restricted"
                      ? text.restricted
                      : (entry.procedure ??
                        t.labels.followupStatus[entry.status]);
                  const when = entry.endedAt
                    ? text.endedOn(formatDate(entry.endedAt, locale))
                    : entry.startedAt
                      ? text.startedOn(formatDate(entry.startedAt, locale))
                      : text.createdOn(formatDate(entry.createdAt, locale));
                  return (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 text-sm">
                        <p className="truncate font-semibold">{title}</p>
                        <p className="text-ink-muted">
                          {t.labels.followupStatus[entry.status]} · {when}
                          {entry.procedureAt
                            ? ` · ${formatDateTime(entry.procedureAt, locale)}`
                            : ""}
                          {entry.isTest ? ` · ${text.test}` : ""}
                        </p>
                      </div>
                      {entry.access === "restricted" ? null : (
                        <ButtonLink
                          href={`/app/suivis/${entry.id}`}
                          variant="quiet"
                          size="sm"
                          aria-label={text.openFollowupLabel(title)}
                          icon={
                            <ChevronRight
                              aria-hidden="true"
                              className="size-3.5"
                            />
                          }
                        >
                          {text.openFollowup}
                        </ButtonLink>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </>
  );
}
