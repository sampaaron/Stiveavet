import { ArrowLeft, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { findFollowup, vetById } from "@/fixtures/cabinet-tilleuls";
import type { Followup } from "@/fixtures/types";
import { SectionCard } from "@/ui/card";
import { SpeciesIcon, followupStatus } from "@/ui/followup-card";
import { StatusBadge } from "@/ui/status-badge";

import { FollowupWorkspace } from "./followup-workspace";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const followup = findFollowup((await params).id);
  return {
    title: followup ? `Dossier ${followup.animal.name}` : "Dossier introuvable",
  };
}

export default async function FollowupPage({ params }: Params) {
  const followup = findFollowup((await params).id);
  // Identifiant inconnu ou hors du cabinet : même réponse, pour ne rien révéler.
  if (!followup) notFound();

  const vet = vetById(followup.responsibleVetId);
  const { animal } = followup;

  return (
    <>
      <Link
        href="/app"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Aujourd&apos;hui
      </Link>

      <header className="mb-6 flex flex-wrap items-start gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-surface text-ink-muted shadow-[var(--shadow-card)]">
          <SpeciesIcon species={animal.species} className="size-7" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{animal.name}</h1>
            <StatusBadge status={followupStatus(followup)} />
            {followup.isPrivate ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted">
                <Lock aria-hidden="true" className="size-3.5" />
                Dossier privé
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-ink-muted">
            {capitalize(animal.species)} · {animal.breed} · {animal.age} ·{" "}
            {animal.weight}
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">
            {followup.procedure} · {followup.procedureDate} ·{" "}
            {followup.dayLabel} · Responsable :{" "}
            <span className="font-semibold text-ink">
              {vet?.name ?? "non attribué"}
            </span>
          </p>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <FollowupWorkspace
          animalName={animal.name}
          ownerFirstName={
            followup.owners[0]?.name.split(" ")[0] ?? "le propriétaire"
          }
          triage={followup.triage}
          initialState={followup.state}
          messages={followup.messages}
          lastActivity={followup.lastActivity}
        />

        <div className="flex min-w-0 flex-col gap-6">
          <Synthesis followup={followup} />
          <Contacts followup={followup} />
          <SectionCard title="Traitements validés" headingLevel={2}>
            {followup.treatments.length > 0 ? (
              <ul className="grid gap-3">
                {followup.treatments.map((treatment) => (
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
            description={`Contrôle : ${followup.controlAppointment}`}
          >
            {followup.nextSteps.length > 0 ? (
              <ol className="grid gap-2">
                {followup.nextSteps.map((step) => (
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
              {followup.allergies.map((allergy) => (
                <li key={allergy}>{allergy}</li>
              ))}
            </ul>
          </SectionCard>
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
