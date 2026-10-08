import { ArrowLeft, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DomainError } from "@/domains/equipe/actor";
import type { LaunchSheet } from "@/domains/suivis/lancement";
import { appText } from "@/i18n/app/server";
import type { AppDictionary } from "@/i18n/app/types";
import type { Locale } from "@/i18n/locales";
import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { AlertBanner } from "@/ui/alert-banner";
import { SectionCard } from "@/ui/card";
import { formatDate, formatDateTime, toDateTimeInput } from "@/ui/format";

import { TestMark } from "../../test-mark";

import { ProtocolForm } from "./protocol-form";
import { SheetForm } from "./sheet-form";

// Titre générique : le nom de l'animal n'apparaît qu'après contrôle d'accès, dans la page.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.followups.sheet.title };
}

async function loadSheet(
  context: Awaited<ReturnType<typeof requirePermission>>,
  id: string,
): Promise<LaunchSheet> {
  try {
    return await services.launch().sheet(context, id);
  } catch (error) {
    // Inexistant, autre cabinet ou non autorisé : même réponse 404.
    if (error instanceof DomainError) notFound();
    throw error;
  }
}

export default async function LaunchSheetPage({
  params,
  searchParams,
}: PageProps<"/app/suivis/[id]/lancement">) {
  const context = await requirePermission("followups.launch");
  const { id } = await params;
  const sheet = await loadSheet(context, id);
  const { fait } = await searchParams;
  const { t, locale } = await appText();
  const text = t.followups.sheet;
  const done =
    fait === "enregistre"
      ? text.saved
      : fait === "protocole"
        ? text.protocolApplied
        : undefined;
  const { followup } = sheet;
  const draft = followup.status === "draft";

  return (
    <>
      <Link
        href={`/app/suivis/${followup.id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {text.back(followup.animalName)}
      </Link>
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">
            {draft
              ? text.draftHeading(followup.animalName)
              : text.editHeading(followup.animalName)}
          </h1>
          {followup.isTest ? <TestMark /> : null}
        </div>
        <p className="mt-1 text-ink-muted">
          {followup.procedure} · {formatDateTime(followup.procedureAt, locale)}{" "}
          · {t.labels.followupStatus[followup.status]} · {text.responsible}{" "}
          <span className="font-semibold text-ink">
            {followup.responsibleName}
          </span>
        </p>
      </header>

      {done ? (
        <p
          role="status"
          className="mb-4 rounded-[var(--radius-card)] bg-brand-soft px-4 py-3 text-sm font-medium text-brand-ink"
        >
          {done}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {followup.status === "ended" ? (
            <AlertBanner tone="info" title={text.endedTitle}>
              {text.endedBody}
            </AlertBanner>
          ) : !sheet.protocol ? (
            <AlertBanner tone="watch" title={text.noProtocolTitle}>
              {text.noProtocolBody}
            </AlertBanner>
          ) : sheet.rights.canEdit ? (
            <SheetForm
              key={followup.planRevision}
              sheet={sheet}
              controlInput={
                followup.controlAppointmentAt
                  ? toDateTimeInput(followup.controlAppointmentAt)
                  : ""
              }
            />
          ) : (
            <AlertBanner tone="info" title={text.restrictedTitle}>
              {text.restrictedBody}
            </AlertBanner>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <SectionCard title={text.protocolTitle}>
            {draft ? (
              <ProtocolForm
                followupId={followup.id}
                currentProtocolId={sheet.protocol?.protocolId ?? null}
                options={sheet.protocolOptions}
              />
            ) : sheet.protocol ? (
              <p className="flex items-start gap-2 text-sm">
                <Lock
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-ink-muted"
                />
                <span>
                  <span className="font-semibold">
                    {text.protocolVersion(
                      sheet.protocol.name,
                      sheet.protocol.versionNumber,
                    )}
                  </span>
                  <span className="block text-ink-muted">
                    {text.protocolFrozen}
                  </span>
                </span>
              </p>
            ) : null}
          </SectionCard>
          <ImportedSummary sheet={sheet} t={t} locale={locale} />
        </div>
      </div>
    </>
  );
}

function ImportedSummary({
  sheet,
  t,
  locale,
}: {
  sheet: LaunchSheet;
  t: AppDictionary;
  locale: Locale;
}) {
  const { followup, imported, contacts } = sheet;
  const text = t.followups.imported;
  return (
    <SectionCard
      title={text.title}
      description={
        imported
          ? text.importedOn(formatDateTime(imported.importedAt, locale))
          : text.notImported
      }
    >
      <dl className="grid gap-3 text-sm">
        <Fact
          label={text.animal}
          value={[
            followup.animalName,
            t.labels.species[followup.species],
            followup.breed,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        <Fact
          label={text.procedure}
          value={text.procedureOn(
            followup.procedure,
            formatDateTime(followup.procedureAt, locale),
          )}
        />
        <div>
          <dt className="text-ink-muted">{text.owners}</dt>
          <dd>
            {contacts.length ? (
              <ul className="grid gap-1">
                {contacts.map((contact) => (
                  <li key={contact.role}>
                    <span className="font-semibold">{contact.name}</span>{" "}
                    <span className="text-ink-muted">
                      {text.whatsapp(contact.phone)}
                      {contact.language === "en"
                        ? text.ownerLanguage(t.labels.languages.en)
                        : ""}
                      {contact.active ? "" : text.secondInactive}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="font-semibold">—</span>
            )}
          </dd>
        </div>
        {imported ? (
          <>
            <Fact
              label={text.allergies}
              value={
                imported.allergies.length
                  ? imported.allergies.join(" · ")
                  : text.noAllergies
              }
            />
            <Fact
              label={text.antecedents}
              value={
                imported.antecedents.length
                  ? imported.antecedents.join(" · ")
                  : text.noAntecedents
              }
            />
            <Fact label={text.externalRef} value={imported.externalRef} />
          </>
        ) : null}
        <Fact
          label={text.control}
          value={
            followup.controlAppointmentAt
              ? formatDate(followup.controlAppointmentAt, locale)
              : text.controlNone
          }
        />
      </dl>
    </SectionCard>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
