import { ArrowLeft, History, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { SYSTEM_CHANGE_NOTES } from "@/domains/protocoles/service";
import type { ProtocolDetail } from "@/domains/protocoles/service";
import { appText } from "@/i18n/app/server";
import type { AppDictionary } from "@/i18n/app/types";
import type { Locale } from "@/i18n/locales";
import { AlertBanner } from "@/ui/alert-banner";
import { ButtonLink } from "@/ui/button";
import { SectionCard } from "@/ui/card";
import { formatDate } from "@/ui/format";
import { StatusBadge } from "@/ui/status-badge";

import { loadProtocol } from "../load";
import { ValidationBadge } from "../protocol-badges";
import {
  ArchiveProtocolForm,
  DuplicateProtocolForm,
  ValidateProtocolForm,
} from "../protocol-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.protocols.detail.metaTitle };
}

/** « 4 h après », « J+1 », « J+10, 4 h » : délai lisible d'une étape. */
function offsetText(t: AppDictionary, offsetHours: number): string {
  const text = t.protocols.detail;
  if (offsetHours < 24) return text.offsetHours(offsetHours);
  const days = Math.floor(offsetHours / 24);
  const hours = offsetHours % 24;
  return hours ? text.offsetDaysHours(days, hours) : text.offsetDays(days);
}

/** Notes de l'application traduites ; une note écrite par un vétérinaire reste telle quelle. */
function changeNoteText(t: AppDictionary, note: string): string {
  const notes = t.protocols.versions.systemNotes;
  if (note === SYSTEM_CHANGE_NOTES.creation) return notes.creation;
  if (note === SYSTEM_CHANGE_NOTES.copy) return notes.copy;
  if (note === SYSTEM_CHANGE_NOTES.library) return notes.library;
  return note;
}

export default async function ProtocolPage({
  params,
  searchParams,
}: PageProps<"/app/protocoles/[id]">) {
  const { id } = await params;
  const { version } = await searchParams;
  const requested =
    typeof version === "string" && /^\d{1,4}$/.test(version)
      ? Number(version)
      : undefined;
  const { t, locale } = await appText();
  const text = t.protocols.detail;
  const protocol = await loadProtocol(id, requested);
  const { content } = protocol.version;

  return (
    <>
      <Link
        href="/app/protocoles"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t.protocols.title}
      </Link>

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{content.name}</h1>
          <ValidationBadge validated={protocol.version.validatedAt !== null} />
          {protocol.archived ? (
            <span className="text-xs font-semibold text-ink-muted">
              {text.archived}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-ink-muted">
          {[
            t.labels.protocolCategories[content.category],
            t.labels.species[content.species],
            text.days(content.durationDays),
            text.version(protocol.version.versionNumber),
            protocol.ownerMembershipId
              ? text.personal(
                  protocol.ownerName ?? t.protocols.versions.removedMember,
                )
              : text.cabinet,
          ].join(" · ")}
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {!protocol.isCurrent ? (
            <AlertBanner
              tone="info"
              title={text.readOnly(protocol.version.versionNumber)}
              action={
                <Link
                  href={`/app/protocoles/${protocol.id}`}
                  className="text-sm font-semibold text-brand-ink underline"
                >
                  {text.seeCurrent}
                </Link>
              }
            >
              {text.readOnlyBody}
            </AlertBanner>
          ) : null}
          {protocol.fromLibrary && protocol.version.validatedAt === null ? (
            <AlertBanner tone="watch" title={t.protocols.library.notice} />
          ) : null}
          {content.description ? (
            <SectionCard title={text.description}>
              <p className="text-sm whitespace-pre-line">
                {content.description}
              </p>
            </SectionCard>
          ) : null}
          <SectionCard
            title={text.steps}
            description={text.stepsDescription}
          >
            <ol className="grid gap-3">
              {content.steps.map((step, index) => (
                <li key={index} className="flex gap-3 text-sm">
                  <span className="w-24 shrink-0 font-semibold tabular-nums">
                    {offsetText(t, step.offsetHours)}
                  </span>
                  <span>
                    <span className="block font-semibold">
                      {t.labels.stepKinds[step.kind]}
                    </span>
                    <span className="block text-ink-muted">{step.content}</span>
                  </span>
                </li>
              ))}
            </ol>
          </SectionCard>
          <SectionCard
            title={text.alerts}
            description={text.alertsDescription}
          >
            <ul className="grid gap-2">
              {content.alerts.map((alert, index) => (
                <li
                  key={index}
                  className="flex flex-wrap items-center gap-2 text-sm"
                >
                  <StatusBadge status={alert.level} />
                  {alert.description}
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Actions t={t} protocol={protocol} />
          <Versions t={t} locale={locale} protocol={protocol} />
        </div>
      </div>
    </>
  );
}

function Actions({
  t,
  protocol,
}: {
  t: AppDictionary;
  protocol: ProtocolDetail;
}) {
  const { can } = protocol;
  if (!protocol.isCurrent) return null;
  const any =
    can.edit ||
    can.archive ||
    can.validate ||
    can.duplicateToCabinet ||
    can.duplicateToPersonal;
  if (!any) return null;
  return (
    <SectionCard title={t.protocols.actions.title}>
      <div className="grid gap-4">
        {can.validate ? (
          <ValidateProtocolForm protocolId={protocol.id} />
        ) : null}
        {can.edit ? (
          <ButtonLink
            href={`/app/protocoles/${protocol.id}/modifier`}
            variant="secondary"
            icon={<Pencil aria-hidden="true" className="size-4" />}
          >
            {t.common.edit}
          </ButtonLink>
        ) : null}
        {can.duplicateToPersonal ? (
          <DuplicateProtocolForm
            protocolId={protocol.id}
            scope="personal"
            label={t.protocols.actions.duplicatePersonal}
          />
        ) : null}
        {can.duplicateToCabinet ? (
          <DuplicateProtocolForm
            protocolId={protocol.id}
            scope="cabinet"
            label={t.protocols.actions.duplicateCabinet}
          />
        ) : null}
        {can.archive ? (
          <ArchiveProtocolForm
            protocolId={protocol.id}
            archived={protocol.archived}
          />
        ) : null}
      </div>
    </SectionCard>
  );
}

function Versions({
  t,
  locale,
  protocol,
}: {
  t: AppDictionary;
  locale: Locale;
  protocol: ProtocolDetail;
}) {
  const text = t.protocols.versions;
  return (
    <SectionCard title={text.title} description={text.description}>
      <ol className="grid gap-3">
        {protocol.versions.map((entry) => {
          const selected =
            entry.versionNumber === protocol.version.versionNumber;
          return (
            <li key={entry.id} className="text-sm">
              <Link
                href={`/app/protocoles/${protocol.id}?version=${entry.versionNumber}`}
                aria-current={selected ? "page" : undefined}
                className="inline-flex items-center gap-1.5 font-semibold text-brand-ink underline-offset-2 hover:underline aria-[current=page]:text-ink"
              >
                <History aria-hidden="true" className="size-3.5" />
                {text.version(entry.versionNumber)}
              </Link>
              <span className="block text-ink-muted">
                {formatDate(entry.createdAt, locale)} ·{" "}
                {entry.createdByName ?? text.removedMember}
                {entry.changeNote
                  ? ` · ${changeNoteText(t, entry.changeNote)}`
                  : ""}
              </span>
              <span className="block text-ink-muted">
                {entry.validatedAt
                  ? text.validatedBy(
                      entry.validatedByName ?? text.removedMember,
                    )
                  : text.notValidated}
                {entry.followupCount > 0
                  ? text.followups(entry.followupCount)
                  : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </SectionCard>
  );
}
