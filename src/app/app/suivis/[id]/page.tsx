import { ArrowLeft, Lock } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import type { FollowupView } from "@/domains/suivis/service";
import { findFollowup } from "@/fixtures/cabinet-tilleuls";
import { showsReferenceFixtures } from "@/fixtures/seed-ids";
import type { Followup } from "@/fixtures/types";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";
import { AlertBanner } from "@/ui/alert-banner";
import { SectionCard } from "@/ui/card";
import { SpeciesIcon, followupStatus } from "@/ui/followup-card";
import { formatDate } from "@/ui/format";
import { StatusBadge } from "@/ui/status-badge";

import {
  FOLLOWUP_STATUS_LABELS,
  SPECIES_LABELS,
  followupBadge,
} from "../followup-labels";

import { AccessPanel } from "./access-panel";
import { FollowupWorkspace } from "./followup-workspace";

// Titre générique : le nom de l'animal n'apparaît qu'après contrôle d'accès, dans la page.
export const metadata: Metadata = { title: "Dossier de suivi" };

export default async function FollowupPage({
  params,
}: PageProps<"/app/suivis/[id]">) {
  const { id } = await params;
  const context = await memberContext();
  // Inexistant, autre cabinet ou non autorisé : même réponse 404, pour ne rien révéler.
  const opened = await services.followups().open(context, id);
  if (!opened) notFound();
  const { followup } = opened;

  // Écran de référence (données fictives détaillées) : seulement avec l'accès clinique.
  const fixture =
    followup.access === "clinical" &&
    showsReferenceFixtures(context.organizationId)
      ? findFollowup(id)
      : undefined;

  const accessPanel = opened.canManageAccess ? (
    <AccessPanel
      context={context}
      followupId={followup.id}
      isPrivate={followup.isPrivate}
      shares={opened.shares}
    />
  ) : null;

  return (
    <>
      <Link
        href="/app/suivis"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Suivis
      </Link>

      {fixture ? (
        <ReferenceDossier
          fixture={fixture}
          followup={followup}
          canAct={context.permissions.has("owner_messages.reply")}
          accessPanel={accessPanel}
        />
      ) : (
        <BasicDossier followup={followup} accessPanel={accessPanel} />
      )}
    </>
  );
}

function PrivateMark({ isPrivate }: { isPrivate: boolean }) {
  if (!isPrivate) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted">
      <Lock aria-hidden="true" className="size-3.5" />
      Dossier privé
    </span>
  );
}

/** Dossier construit depuis la base : organisation seulement, ou clinique sans écran de référence. */
function BasicDossier({
  followup,
  accessPanel,
}: {
  followup: FollowupView;
  accessPanel: ReactNode;
}) {
  const badge = followupBadge(followup);
  return (
    <>
      <header className="mb-6 flex flex-wrap items-start gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-surface text-ink-muted shadow-[var(--shadow-card)]">
          <SpeciesIcon
            species={followup.species === "cat" ? "chat" : "chien"}
            className="size-7"
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">
              {followup.animalName}
            </h1>
            {badge ? <StatusBadge status={badge} /> : null}
            <PrivateMark isPrivate={followup.isPrivate} />
          </div>
          <p className="mt-1 text-ink-muted">
            {SPECIES_LABELS[followup.species]} · Responsable :{" "}
            <span className="font-semibold text-ink">
              {followup.responsibleName}
            </span>
          </p>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <SectionCard title="Organisation">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Fact label="Propriétaire" value={followup.ownerName ?? "—"} />
              <Fact
                label="État du suivi"
                value={FOLLOWUP_STATUS_LABELS[followup.status]}
              />
              <Fact
                label="Début du suivi"
                value={
                  followup.startedAt ? formatDate(followup.startedAt) : "—"
                }
              />
              <Fact
                label="Contrôle"
                value={
                  followup.controlAppointmentAt
                    ? formatDate(followup.controlAppointmentAt)
                    : "Non programmé"
                }
              />
            </dl>
          </SectionCard>
          {followup.access === "clinical" ? (
            <SectionCard title="Intervention">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <Fact label="Acte" value={followup.procedure} />
                <Fact label="Date" value={formatDate(followup.procedureAt)} />
              </dl>
            </SectionCard>
          ) : (
            <AlertBanner tone="info" title="Données cliniques réservées">
              Conversation, photos, vocaux et synthèses ne sont visibles que par
              les personnes autorisées à lire les données cliniques.
            </AlertBanner>
          )}
        </div>
        {accessPanel ? (
          <div className="flex min-w-0 flex-col gap-6">{accessPanel}</div>
        ) : null}
      </div>
    </>
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

function ReferenceDossier({
  fixture,
  followup,
  canAct,
  accessPanel,
}: {
  fixture: Followup;
  followup: FollowupView;
  canAct: boolean;
  accessPanel: ReactNode;
}) {
  const { animal } = fixture;
  return (
    <>
      <header className="mb-6 flex flex-wrap items-start gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-surface text-ink-muted shadow-[var(--shadow-card)]">
          <SpeciesIcon species={animal.species} className="size-7" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{animal.name}</h1>
            <StatusBadge status={followupStatus(fixture)} />
            <PrivateMark isPrivate={followup.isPrivate} />
          </div>
          <p className="mt-1 text-ink-muted">
            {capitalize(animal.species)} · {animal.breed} · {animal.age} ·{" "}
            {animal.weight}
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">
            {fixture.procedure} · {fixture.procedureDate} · {fixture.dayLabel} ·
            Responsable :{" "}
            <span className="font-semibold text-ink">
              {followup.responsibleName}
            </span>
          </p>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <FollowupWorkspace
          animalName={animal.name}
          ownerFirstName={
            fixture.owners[0]?.name.split(" ")[0] ?? "le propriétaire"
          }
          triage={fixture.triage}
          initialState={fixture.state}
          messages={fixture.messages}
          lastActivity={fixture.lastActivity}
          canAct={canAct}
        />

        <div className="flex min-w-0 flex-col gap-6">
          <Synthesis followup={fixture} />
          <Contacts followup={fixture} />
          <SectionCard title="Traitements validés" headingLevel={2}>
            {fixture.treatments.length > 0 ? (
              <ul className="grid gap-3">
                {fixture.treatments.map((treatment) => (
                  <li key={treatment.name} className="text-sm">
                    <p className="font-semibold">{treatment.name}</p>
                    <p className="text-ink-muted">
                      {treatment.schedule} · validé par {treatment.validatedBy}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">
                Aucun traitement à rappeler.
              </p>
            )}
            <p className="mt-3 text-xs text-ink-muted">
              Numa ne crée ni ne modifie jamais une posologie.
            </p>
          </SectionCard>
          <SectionCard
            title="Prochaines étapes"
            description={`Contrôle : ${fixture.controlAppointment}`}
          >
            {fixture.nextSteps.length > 0 ? (
              <ol className="grid gap-2">
                {fixture.nextSteps.map((step) => (
                  <li key={step.at + step.label} className="flex gap-3 text-sm">
                    <span className="w-32 shrink-0 font-semibold">
                      {step.at}
                    </span>
                    <span className="text-ink-muted">{step.label}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-ink-muted">Aucune étape programmée.</p>
            )}
          </SectionCard>
          <SectionCard
            title="Allergies et antécédents"
            description="Résumé importé de dr.veto (simulé)."
          >
            <ul className="list-inside list-disc text-sm">
              {fixture.allergies.map((allergy) => (
                <li key={allergy}>{allergy}</li>
              ))}
            </ul>
          </SectionCard>
          {accessPanel}
        </div>
      </div>
    </>
  );
}

function Synthesis({ followup }: { followup: Followup }) {
  const { synthesis } = followup;
  return (
    <SectionCard
      title="Synthèse pré-consultation"
      description="Préparée à partir des échanges. Elle ne remplace pas votre examen."
    >
      {synthesis ? (
        <div className="grid gap-4 text-sm">
          <p>{synthesis.evolution}</p>
          <SignalList
            title="Signaux rassurants"
            items={synthesis.positives}
            tone="brand"
          />
          <SignalList
            title="Signaux préoccupants"
            items={synthesis.negatives}
            tone="urgent"
          />
          <SignalList title="Alertes" items={synthesis.alerts} tone="urgent" />
          <SignalList
            title="Questions ouvertes"
            items={synthesis.openQuestions}
            tone="neutral"
          />
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          Pas encore assez d&apos;échanges pour une synthèse.
        </p>
      )}
    </SectionCard>
  );
}

function SignalList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "brand" | "urgent" | "neutral";
}) {
  if (items.length === 0) return null;
  const marker = {
    brand: "bg-brand",
    urgent: "bg-urgent",
    neutral: "bg-ink-muted",
  }[tone];
  return (
    <div>
      <h3 className="mb-1 font-semibold">{title}</h3>
      <ul className="grid gap-1">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span
              aria-hidden="true"
              className={`mt-2 size-1.5 shrink-0 rounded-full ${marker}`}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Contacts({ followup }: { followup: Followup }) {
  const consentStatus = {
    pending: "consent-pending",
    given: "consent-given",
    stopped: "consent-stopped",
  } as const;
  return (
    <SectionCard
      title="Propriétaires et accord"
      description={
        followup.owners.length > 1
          ? "Un groupe WhatsApp sera créé quand les deux contacts auront accepté."
          : undefined
      }
    >
      <ul className="grid gap-3">
        {followup.owners.map((owner) => (
          <li
            key={owner.phone}
            className="flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <span>
              <span className="block font-semibold">
                {owner.name}
                <span className="font-normal text-ink-muted">
                  {" "}
                  ·{" "}
                  {owner.role === "principal"
                    ? "contact principal"
                    : "second contact"}
                </span>
              </span>
              <span className="block text-ink-muted">
                {owner.phone} ·{" "}
                {owner.language === "fr" ? "français" : "anglais"}
              </span>
            </span>
            <StatusBadge status={consentStatus[owner.consent]} />
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
