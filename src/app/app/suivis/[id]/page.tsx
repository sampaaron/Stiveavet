import { ArrowLeft, Lock } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import type { FollowupClinical, FollowupView } from "@/domains/suivis/service";
import type {
  FollowupContactView,
  TreatmentView,
} from "@/domains/suivis/record";
import type { SynthesisAlert, SynthesisView } from "@/domains/suivis/synthese";
import { daysSince } from "@/domains/suivis/calendrier";
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
import { SpeciesIcon } from "@/ui/followup-card";
import {
  formatDate,
  formatDateTime,
  formatRelativeDayTime,
  shortPersonName,
} from "@/ui/format";
import { ButtonLink } from "@/ui/button";
import { StatusBadge } from "@/ui/status-badge";
import type { Status } from "@/ui/status-badge";

import {
  FOLLOWUP_STATUS_LABELS,
  SPECIES_LABELS,
  followupBadge,
} from "../followup-labels";
import { AlertCard } from "../../alert-card";
import { TestMark } from "../test-mark";

import { AccessPanel } from "./access-panel";
import { LiveConversation } from "./live-conversation";
import { NextStepsCard } from "./programme-card";
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
  const { followup, record } = opened;

  const protocolLink =
    followup.access === "clinical" && followup.protocol ? (
      <ProtocolLink
        protocol={followup.protocol}
        linked={canBrowseProtocols(context)}
      />
    ) : null;

  const accessPanel = opened.canManageAccess ? (
    <AccessPanel
      context={context}
      followupId={followup.id}
      isPrivate={followup.isPrivate}
      shares={opened.shares}
    />
  ) : null;

  const back = (
    <Link
      href="/app/suivis"
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      Suivis
    </Link>
  );
  const notice = done ? (
    <p
      role="status"
      className="mb-4 rounded-[var(--radius-card)] bg-brand-soft px-4 py-3 text-sm font-medium text-brand-ink"
    >
      {done}
    </p>
  ) : null;

  // Organisation seulement, ou suivi pas encore lancé : vue simple, sans conversation.
  if (
    followup.access !== "clinical" ||
    record.access !== "clinical" ||
    followup.status === "draft"
  )
    return (
      <>
        {back}
        {notice}
        <BasicDossier
          followup={followup}
          accessPanel={accessPanel}
          protocolLink={protocolLink}
          steering={<Steering context={context} followup={followup} />}
        />
      </>
    );

  // Dossier clinique d'un suivi lancé : tout est lu dans la base, au moment de l'ouverture.
  const now = new Date();
  const [view, links, alerts, programme, synthesis] = await Promise.all([
    services.conversations().view(context, followup.id),
    services.media().readLinks(context, followup.id),
    services.alerts().ofFollowup(context, followup.id),
    services.launch().programme(context, followup.id),
    services.synthesis().forFollowup(context, followup.id, { now }),
  ]);
  const openAlerts = alerts.filter((alert) => alert.status !== "resolved");
  const primary = record.contacts.find((contact) => contact.role === "primary");

  return (
    <>
      {back}
      {notice}
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
            <StatusBadge status={dossierStatus(followup, primary)} />
            <PrivateMark isPrivate={followup.isPrivate} />
            {followup.isTest ? <TestMark /> : null}
          </div>
          <p className="mt-1 text-ink-muted">
            {[
              SPECIES_LABELS[followup.species],
              record.facts.animal.breed,
              ageLabel(record.facts.animal.birthDate, now),
              weightLabel(record.facts.animal.weightGrams),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">
            {followup.procedure} ·{" "}
            {formatRelativeDayTime(followup.procedureAt, now)} · J+
            {daysSince(followup.procedureAt, now)} · Responsable :{" "}
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
        <div className="flex min-w-0 flex-col gap-4">
          {openAlerts.length ? (
            <section aria-label="Alertes du triage" className="grid gap-3">
              {openAlerts.map((alert) => (
                <AlertCard key={alert.id} alert={alert} from="dossier" />
              ))}
            </section>
          ) : null}
          <LiveConversation
            view={view}
            links={links}
            simulatorHref={
              serverEnv().APP_ENV === "local" && !followup.isTest
                ? `/app/suivis/${followup.id}/simulateur`
                : null
            }
          />
          <Steering context={context} followup={followup} />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Synthesis synthesis={synthesis} />
          <Contacts contacts={record.contacts} />
          <Treatments treatments={record.facts.treatments} />
          <NextStepsCard
            programme={programme}
            controlAppointmentAt={followup.controlAppointmentAt}
            now={now}
          />
          <SectionCard
            title="Allergies et antécédents"
            description="Résumé importé de dr.veto (simulé)."
          >
            {record.facts.imported ? (
              <ImportedSummary imported={record.facts.imported} />
            ) : (
              <p className="text-sm text-ink-muted">
                Aucun résumé importé pour ce suivi.
              </p>
            )}
          </SectionCard>
          {accessPanel}
        </div>
      </div>
    </>
  );
}

/** Statut principal du dossier : la gravité prime, puis la pause, puis l'accord attendu. */
function dossierStatus(
  followup: FollowupClinical,
  primary: FollowupContactView | undefined,
): Status {
  if (followup.triage !== "normal") return followup.triage;
  if (followup.status === "paused") return "paused";
  if (primary && primary.consent !== "given" && primary.consent !== "withdrawn")
    return "consent-pending";
  return "normal";
}

function ageLabel(birthDate: string | null, now: Date): string | null {
  if (!birthDate) return null;
  const [year = 0, month = 1, day = 1] = birthDate.split("-").map(Number);
  let months =
    (now.getUTCFullYear() - year) * 12 + (now.getUTCMonth() + 1 - month);
  if (now.getUTCDate() < day) months -= 1;
  if (months < 0) return null;
  if (months < 12) return `${months} mois`;
  const years = Math.floor(months / 12);
  return `${years} an${years > 1 ? "s" : ""}`;
}

const weightFormat = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
});

function weightLabel(grams: number | null): string | null {
  return grams ? `${weightFormat.format(grams / 1000)} kg` : null;
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

/** Dossier d'organisation (sans données cliniques), ou suivi en préparation. */
function BasicDossier({
  followup,
  accessPanel,
  protocolLink,
  steering,
}: {
  followup: FollowupView;
  accessPanel: ReactNode;
  protocolLink: ReactNode;
  steering: ReactNode;
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

const ALERT_STATE: Record<
  SynthesisAlert["status"],
  (alert: SynthesisAlert) => string
> = {
  open: () => "sans accusé de réception",
  escalated: () => "équipe prévenue, sans accusé de réception",
  acknowledged: (alert) =>
    `reçue par ${alert.acknowledgedBy ? shortPersonName(alert.acknowledgedBy) : "un vétérinaire"}`,
  resolved: () => "close",
};

function alertLine(alert: SynthesisAlert): string {
  return `${alert.level === "urgent" ? "Urgent" : "À surveiller"} · ${alert.reason} · ${formatDateTime(alert.createdAt)} · ${ALERT_STATE[alert.status](alert)}`;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

/** Synthèse pré-consultation (§9) : rédigée par l'IA (simulée), sous garde-fous. */
function Synthesis({ synthesis }: { synthesis: SynthesisView | null }) {
  return (
    <SectionCard
      title="Synthèse pré-consultation"
      description="Préparée par l'IA à partir des échanges (simulation). Elle ne remplace pas votre examen."
    >
      {synthesis ? (
        <div className="grid gap-4 text-sm">
          <p className="text-ink-muted">
            Échanges :{" "}
            {plural(
              synthesis.exchanges.ownerMessages,
              "message du propriétaire",
              "messages du propriétaire",
            )}
            , {plural(synthesis.exchanges.photos, "photo", "photos")},{" "}
            {plural(
              synthesis.exchanges.voiceNotes,
              "message vocal",
              "messages vocaux",
            )}
            .
          </p>
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
          <SignalList
            title="Alertes"
            items={synthesis.alerts.map(alertLine)}
            tone="urgent"
          />
          <SignalList
            title="Questions ouvertes"
            items={synthesis.openQuestions}
            tone="neutral"
          />
          {synthesis.withheld > 0 ? (
            <p className="text-ink-muted">
              {synthesis.withheld > 1
                ? `${synthesis.withheld} éléments ont été écartés par les garde-fous`
                : "Un élément a été écarté par les garde-fous"}{" "}
              : lisez la conversation pour le détail.
            </p>
          ) : null}
          <p className="text-xs text-ink-muted">
            Préparée le {formatDateTime(synthesis.generatedAt)}, sans diagnostic
            ni conduite à tenir.
          </p>
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
        {items.map((item, index) => (
          <li key={`${index}-${item}`} className="flex gap-2">
            <span
              aria-hidden="true"
              className={`mt-2 size-1.5 shrink-0 rounded-full ${marker}`}
            />
            <span className="min-w-0 break-words">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const CONSENT_STATUS = {
  requested: "consent-pending",
  given: "consent-given",
  withdrawn: "consent-stopped",
} as const;

/** Propriétaires et accord : jamais le numéro complet, seulement ses deux derniers chiffres. */
function Contacts({ contacts }: { contacts: FollowupContactView[] }) {
  const active = contacts.filter((contact) => contact.active);
  return (
    <SectionCard
      title="Propriétaires et accord"
      description={
        active.length > 1
          ? "Un groupe WhatsApp sera créé quand les deux contacts auront accepté."
          : undefined
      }
    >
      <ul className="grid gap-3">
        {active.map((contact) => (
          <li
            key={contact.id}
            className="flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <span>
              <span className="block font-semibold">
                {contact.name}
                <span className="font-normal text-ink-muted">
                  {" "}
                  ·{" "}
                  {contact.role === "primary"
                    ? "contact principal"
                    : "second contact"}
                </span>
              </span>
              <span className="block text-ink-muted">
                {contact.phoneEnding
                  ? `WhatsApp se terminant par ${contact.phoneEnding}`
                  : "WhatsApp"}{" "}
                · {contact.language === "fr" ? "français" : "anglais"}
              </span>
            </span>
            <StatusBadge
              status={
                contact.consent
                  ? CONSENT_STATUS[contact.consent]
                  : "consent-pending"
              }
            />
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

/** Traitements validés ; ceux importés et pas encore validés ne sont jamais rappelés. */
function Treatments({ treatments }: { treatments: TreatmentView[] }) {
  const validated = treatments.filter((treatment) => treatment.validatedBy);
  const pending = treatments.length - validated.length;
  return (
    <SectionCard title="Traitements validés" headingLevel={2}>
      {validated.length > 0 ? (
        <ul className="grid gap-3">
          {validated.map((treatment) => (
            <li key={treatment.id} className="text-sm">
              <p className="font-semibold">
                {treatment.name}
                {treatment.source === "drveto" ? " (importé de dr.veto)" : ""}
              </p>
              <p className="text-ink-muted">
                {treatment.instructions} · validé par{" "}
                {shortPersonName(treatment.validatedBy ?? "")}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">Aucun traitement à rappeler.</p>
      )}
      {pending > 0 ? (
        <p className="mt-3 text-sm font-medium text-watch">
          {pending > 1
            ? `${pending} traitements importés attendent votre validation`
            : "Un traitement importé attend votre validation"}{" "}
          : aucun rappel n&apos;en parle avant.
        </p>
      ) : null}
      <p className="mt-3 text-xs text-ink-muted">
        Numa ne crée ni ne modifie jamais une posologie.
      </p>
    </SectionCard>
  );
}

function ImportedSummary({
  imported,
}: {
  imported: { allergies: string[]; antecedents: string[] };
}) {
  const allergies = imported.allergies.length
    ? imported.allergies
    : ["Aucune allergie connue"];
  return (
    <div className="grid gap-3 text-sm">
      <ul className="list-inside list-disc">
        {allergies.map((allergy) => (
          <li key={allergy}>{allergy}</li>
        ))}
      </ul>
      {imported.antecedents.length ? (
        <div>
          <h3 className="mb-1 font-semibold">Antécédents</h3>
          <ul className="list-inside list-disc">
            {imported.antecedents.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
