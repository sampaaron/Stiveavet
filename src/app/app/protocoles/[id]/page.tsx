import { ArrowLeft, History, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import {
  CATEGORY_LABELS,
  SPECIES_LABELS,
  STEP_KIND_LABELS,
  offsetLabel,
} from "@/domains/protocoles/content";
import { LIBRARY_NOTICE } from "@/domains/protocoles/library";
import type { ProtocolDetail } from "@/domains/protocoles/service";
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

export const metadata: Metadata = { title: "Protocole" };

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
  const protocol = await loadProtocol(id, requested);
  const { content } = protocol.version;

  return (
    <>
      <Link
        href="/app/protocoles"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Protocoles
      </Link>

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{content.name}</h1>
          <ValidationBadge validated={protocol.version.validatedAt !== null} />
          {protocol.archived ? (
            <span className="text-xs font-semibold text-ink-muted">
              Archivé
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-ink-muted">
          {[
            CATEGORY_LABELS[content.category],
            SPECIES_LABELS[content.species],
            `${content.durationDays} jours`,
            `version ${protocol.version.versionNumber}`,
            protocol.ownerName
              ? `protocole personnel de ${protocol.ownerName}`
              : "protocole du cabinet",
          ].join(" · ")}
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {!protocol.isCurrent ? (
            <AlertBanner
              tone="info"
              title={`Version ${protocol.version.versionNumber}, en lecture seule`}
              action={
                <Link
                  href={`/app/protocoles/${protocol.id}`}
                  className="text-sm font-semibold text-brand-ink underline"
                >
                  Voir la version actuelle
                </Link>
              }
            >
              Les suivis lancés avec cette version la gardent telle quelle.
            </AlertBanner>
          ) : null}
          {protocol.fromLibrary && protocol.version.validatedAt === null ? (
            <AlertBanner tone="watch" title={LIBRARY_NOTICE} />
          ) : null}
          {content.description ? (
            <SectionCard title="Description">
              <p className="text-sm whitespace-pre-line">
                {content.description}
              </p>
            </SectionCard>
          ) : null}
          <SectionCard
            title="Étapes"
            description="Numa pose ces questions et envoie ces messages ; elle ne prend aucune décision médicale."
          >
            <ol className="grid gap-3">
              {content.steps.map((step, index) => (
                <li key={index} className="flex gap-3 text-sm">
                  <span className="w-24 shrink-0 font-semibold tabular-nums">
                    {offsetLabel(step.offsetHours)}
                  </span>
                  <span>
                    <span className="block font-semibold">
                      {STEP_KIND_LABELS[step.kind]}
                    </span>
                    <span className="block text-ink-muted">{step.content}</span>
                  </span>
                </li>
              ))}
            </ol>
          </SectionCard>
          <SectionCard
            title="Signes d'alerte"
            description="En cas de doute, Numa escalade vers le vétérinaire."
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
          <Actions protocol={protocol} />
          <Versions protocol={protocol} />
        </div>
      </div>
    </>
  );
}

function Actions({ protocol }: { protocol: ProtocolDetail }) {
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
    <SectionCard title="Actions">
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
            Modifier
          </ButtonLink>
        ) : null}
        {can.duplicateToPersonal ? (
          <DuplicateProtocolForm
            protocolId={protocol.id}
            scope="personal"
            label="Dupliquer dans mes protocoles"
          />
        ) : null}
        {can.duplicateToCabinet ? (
          <DuplicateProtocolForm
            protocolId={protocol.id}
            scope="cabinet"
            label="Dupliquer pour le cabinet"
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

function Versions({ protocol }: { protocol: ProtocolDetail }) {
  return (
    <SectionCard
      title="Historique des versions"
      description="Une version enregistrée ne change plus jamais."
    >
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
                Version {entry.versionNumber}
              </Link>
              <span className="block text-ink-muted">
                {formatDate(entry.createdAt)} · {entry.createdByName}
                {entry.changeNote ? ` · ${entry.changeNote}` : ""}
              </span>
              <span className="block text-ink-muted">
                {entry.validatedByName
                  ? `Validée par ${entry.validatedByName}`
                  : "Non validée"}
                {entry.followupCount > 0
                  ? ` · ${entry.followupCount} suivi(s) lancé(s) avec elle`
                  : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </SectionCard>
  );
}
