import { ArrowLeft, Lock } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import type { FollowupView } from "@/domains/suivis/service";
import { findFollowup } from "@/fixtures/cabinet-tilleuls";
import { showsReferenceFixtures } from "@/fixtures/seed-ids";
import type { Followup } from "@/fixtures/types";
import { canBrowseProtocols } from "@/domains/protocoles/policies";
import {
  canPrepareFollowup,
  canSteerFollowup,
} from "@/domains/suivis/policies";
import type { MemberContext } from "@/server/authz";
import { memberContext } from "@/server/authz";
import { serverEnv } from "@/server/env";
import { services } from "@/server/services";
import { AlertBanner } from "@/ui/alert-banner";
import { SectionCard } from "@/ui/card";
import { SpeciesIcon, followupStatus } from "@/ui/followup-card";
import { formatDate } from "@/ui/format";
import { ButtonLink } from "@/ui/button";
import { StatusBadge } from "@/ui/status-badge";

import {
  FOLLOWUP_STATUS_LABELS,
  SPECIES_LABELS,
  followupBadge,
} from "../followup-labels";
import { AlertCard } from "../../alert-card";
import { TestMark } from "../test-mark";

import { AccessPanel } from "./access-panel";
import { FollowupWorkspace } from "./followup-workspace";
import { LiveConversation } from "./live-conversation";
import { SteeringButtons } from "./steering";

// Titre générique : le nom de l'animal n'apparaît qu'après contrôle d'accès, dans la page.
export const metadata: Metadata = { title: "Dossier de suivi" };

const DONE: Record<string, string> = {
  lance:
    "Suivi lancé : Numa enverra son premier message à l'heure prévue, au nom du cabinet.",
  pause:
    "Suivi mis en pause : aucune relance ne part tant qu'il n'est pas repris.",
  reprise: "Suivi repris.",
  arret: "Suivi arrêté : les envois et rappels prévus sont annulés.",
  reactivation: "Suivi réactivé.",
  "reprise-en-main":
    "Message envoyé : vous avez repris la main, Numa est en pause jusqu'à « Reprendre Numa ».",
  message: "Message envoyé depuis le WhatsApp du cabinet.",
  numa: "Numa reprend la conversation.",
  "alerte-recue": "Réception confirmée : l'escalade est annulée.",
  "alerte-close": "Alerte close.",
};

export default async function FollowupPage({
  params,
  searchParams,
}: PageProps<"/app/suivis/[id]">) {
  const { id } = await params;
  const { fait } = await searchParams;
  const done = typeof fait === "string" ? DONE[fait] : undefined;
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

  const protocolLink =
    followup.access === "clinical" && followup.protocol ? (
      <ProtocolLink
        protocol={followup.protocol}
        linked={canBrowseProtocols(context)}
      />
    ) : null;

  // Conversation réelle : suivi lancé et accès clinique seulement.
  const conversation =
    !fixture &&
    followup.access === "clinical" &&
    followup.status !== "draft" ? (
      <LiveConversation
        view={await services.conversations().view(context, followup.id)}
        simulatorHref={
          serverEnv().APP_ENV === "local" && !followup.isTest
            ? `/app/suivis/${followup.id}/simulateur`
            : null
        }
      />
    ) : null;

  // Alertes du triage non closes, au-dessus de la conversation (accès clinique seulement).
  const alerts =
    !fixture && followup.access === "clinical" && followup.status !== "draft"
      ? (await services.alerts().ofFollowup(context, followup.id)).filter(
          (alert) => alert.status !== "resolved",
        )
      : [];
  const alertCards = alerts.length ? (
    <section aria-label="Alertes du triage" className="grid gap-3">
      {alerts.map((alert) => (
        <AlertCard key={alert.id} alert={alert} from="dossier" />
      ))}
    </section>
  ) : null;

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

      {done ? (
        <p
          role="status"
          className="mb-4 rounded-[var(--radius-card)] bg-brand-soft px-4 py-3 text-sm font-medium text-brand-ink"
        >
          {done}
        </p>
      ) : null}

      {fixture ? (
        <ReferenceDossier
          protocolLink={protocolLink}
          fixture={fixture}
          followup={followup}
          canAct={context.permissions.has("owner_messages.reply")}
          accessPanel={accessPanel}
        />
      ) : (
        <BasicDossier
          followup={followup}
          accessPanel={accessPanel}
          protocolLink={protocolLink}
          steering={<Steering context={context} followup={followup} />}
          alerts={alertCards}
          conversation={conversation}
        />
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
/** Version de protocole avec laquelle le suivi a été lancé ; elle ne change plus. */
function ProtocolLink({
  protocol,
  linked,
}: {
  protocol: { id: string; name: string; versionNumber: number };
  linked: boolean;
}) {
  const label = `${protocol.name}, version ${protocol.versionNumber}`;
  return linked ? (
    <Link
      href={`/app/protocoles/${protocol.id}?version=${protocol.versionNumber}`}
      className="font-semibold text-brand-ink underline-offset-2 hover:underline"
    >
      {label}
    </Link>
  ) : (
    <span className="font-semibold text-ink">{label}</span>
  );
}

/** Fiche de lancement, modification, pause, arrêt et reprise, selon les droits. */
function Steering({
  context,
  followup,
}: {
  context: MemberContext;
  followup: FollowupView;
}) {
  if (!canPrepareFollowup(context, followup.access)) return null;
  const canSteer = canSteerFollowup(context, followup.access);
  if (followup.status === "draft")
    return (
      <SectionCard
        title="Suivi en préparation"
        description="Rien n'est envoyé au propriétaire avant le lancement par le vétérinaire responsable."
      >
        <ButtonLink href={`/app/suivis/${followup.id}/lancement`}>
          Ouvrir la fiche de lancement
        </ButtonLink>
      </SectionCard>
    );
  if (!canSteer) return null;
  return (
    <SectionCard
      title="Pilotage du suivi"
      description="Vous pouvez modifier, mettre en pause, arrêter ou reprendre ce suivi à tout moment."
    >
      <div className="grid gap-4">
        {followup.status !== "ended" ? (
          <div>
            <ButtonLink
              href={`/app/suivis/${followup.id}/lancement`}
              variant="secondary"
              size="sm"
            >
              Modifier le suivi
            </ButtonLink>
          </div>
        ) : null}
        <SteeringButtons followupId={followup.id} status={followup.status} />
      </div>
    </SectionCard>
  );
}

function BasicDossier({
  followup,
  accessPanel,
  protocolLink,
  steering,
  alerts,
  conversation,
}: {
  followup: FollowupView;
  accessPanel: ReactNode;
  protocolLink: ReactNode;
  steering: ReactNode;
  alerts: ReactNode;
  conversation: ReactNode;
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
            {followup.isTest ? <TestMark /> : null}
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
          {alerts}
          {conversation}
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
                {protocolLink ? (
                  <div className="sm:col-span-2">
                    <dt className="text-ink-muted">Protocole</dt>
                    <dd>{protocolLink}</dd>
                  </div>
                ) : null}
              </dl>
            </SectionCard>
          ) : (
            <AlertBanner tone="info" title="Données cliniques réservées">
              Conversation, photos, vocaux et synthèses ne sont visibles que par
              les personnes autorisées à lire les données cliniques.
            </AlertBanner>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          {steering}
          {accessPanel}
        </div>
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
  protocolLink,
}: {
  protocolLink: ReactNode;
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
            {followup.isTest ? <TestMark /> : null}
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
          {protocolLink ? (
            <p className="mt-0.5 text-sm text-ink-muted">
              Protocole : {protocolLink}
            </p>
          ) : null}
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
