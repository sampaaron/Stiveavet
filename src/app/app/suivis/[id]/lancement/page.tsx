import { ArrowLeft, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DomainError } from "@/domains/equipe/actor";
import type { LaunchSheet } from "@/domains/suivis/lancement";
import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { AlertBanner } from "@/ui/alert-banner";
import { SectionCard } from "@/ui/card";
import { formatDate, formatDateTime, toDateTimeInput } from "@/ui/format";

import { FOLLOWUP_STATUS_LABELS, SPECIES_LABELS } from "../../followup-labels";
import { TestMark } from "../../test-mark";

import { ProtocolForm } from "./protocol-form";
import { SheetForm } from "./sheet-form";

// Titre générique : le nom de l'animal n'apparaît qu'après contrôle d'accès, dans la page.
export const metadata: Metadata = { title: "Fiche de lancement" };

const DONE: Record<string, string> = {
  enregistre: "Fiche enregistrée.",
  protocole:
    "Protocole appliqué : étapes et signes d'alerte repris de sa version.",
};

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
  const done = typeof fait === "string" ? DONE[fait] : undefined;
  const { followup } = sheet;
  const draft = followup.status === "draft";

  return (
    <>
      <Link
        href={`/app/suivis/${followup.id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Dossier de {followup.animalName}
      </Link>
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">
            {draft
              ? `Fiche de lancement de ${followup.animalName}`
              : `Modifier le suivi de ${followup.animalName}`}
          </h1>
          {followup.isTest ? <TestMark /> : null}
        </div>
        <p className="mt-1 text-ink-muted">
          {followup.procedure} · {formatDateTime(followup.procedureAt)} ·{" "}
          {FOLLOWUP_STATUS_LABELS[followup.status]} · Responsable :{" "}
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
            <AlertBanner tone="info" title="Suivi terminé">
              Réactivez-le depuis le dossier pour modifier ses étapes.
            </AlertBanner>
          ) : !sheet.protocol ? (
            <AlertBanner tone="watch" title="Choisissez un protocole">
              Aucun protocole validé ne correspond à l&apos;intervention
              importée. Choisissez-en un pour composer la fiche.
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
            <AlertBanner tone="info" title="Modification réservée">
              Un suivi lancé ne se modifie que par un vétérinaire.
            </AlertBanner>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <SectionCard title="Protocole">
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
                    {sheet.protocol.name}, version{" "}
                    {sheet.protocol.versionNumber}
                  </span>
                  <span className="block text-ink-muted">
                    Version figée au lancement. Les modifications ne concernent
                    que ce suivi.
                  </span>
                </span>
              </p>
            ) : null}
          </SectionCard>
          <ImportedSummary sheet={sheet} />
        </div>
      </div>
    </>
  );
}

function ImportedSummary({ sheet }: { sheet: LaunchSheet }) {
  const { followup, imported, contacts } = sheet;
  return (
    <SectionCard
      title="Résumé importé de dr.veto"
      description={
        imported
          ? `Lecture seule · import du ${formatDateTime(imported.importedAt)} (simulé)`
          : "Suivi créé dans Stivea Vet, sans import."
      }
    >
      <dl className="grid gap-3 text-sm">
        <Fact
          label="Animal"
          value={[
            followup.animalName,
            SPECIES_LABELS[followup.species],
            followup.breed,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        <Fact
          label="Intervention"
          value={`${followup.procedure}, le ${formatDateTime(followup.procedureAt)}`}
        />
        <div>
          <dt className="text-ink-muted">Propriétaires</dt>
          <dd>
            {contacts.length ? (
              <ul className="grid gap-1">
                {contacts.map((contact) => (
                  <li key={contact.role}>
                    <span className="font-semibold">{contact.name}</span>{" "}
                    <span className="text-ink-muted">
                      · WhatsApp {contact.phone}
                      {contact.language === "en" ? " · anglais" : ""}
                      {contact.active ? "" : " · second contact, inactif"}
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
              label="Allergies"
              value={
                imported.allergies.length
                  ? imported.allergies.join(" · ")
                  : "Aucune signalée"
              }
            />
            <Fact
              label="Antécédents"
              value={
                imported.antecedents.length
                  ? imported.antecedents.join(" · ")
                  : "Aucun signalé"
              }
            />
            <Fact label="Identifiant dr.veto" value={imported.externalRef} />
          </>
        ) : null}
        <Fact
          label="Contrôle prévu"
          value={
            followup.controlAppointmentAt
              ? formatDate(followup.controlAppointmentAt)
              : "Non programmé"
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
