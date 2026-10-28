import { ArrowLeft, Lock, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import type { AppointmentsService } from "@/domains/agenda/demandes";
import type { FollowupClinical, FollowupView } from "@/domains/suivis/service";
import type {
  FollowupContactView,
  TreatmentView,
} from "@/domains/suivis/record";
import type { SynthesisView } from "@/domains/suivis/synthese";
import { daysSince } from "@/domains/suivis/calendrier";
import type { ConversationView } from "@/domains/conversations/service";
import { canBrowseProtocols } from "@/domains/protocoles/policies";
import {
  canPrepareFollowup,
  canSteerFollowup,
} from "@/domains/suivis/policies";
import { appText } from "@/i18n/app/server";
import type { AppDictionary } from "@/i18n/app/types";
import type { Locale } from "@/i18n/locales";
import type { MemberContext } from "@/server/authz";
import { memberContext } from "@/server/authz";
import { serverEnv } from "@/server/env";
import { services } from "@/server/services";
import { AlertBanner } from "@/ui/alert-banner";
import { Fact, SectionCard } from "@/ui/card";
import { AnimalAvatar } from "@/ui/animal-avatar";
import {
  formatDate,
  formatDateTime,
  formatRelativeDayTime,
  shortPersonName,
} from "@/ui/format";
import { ButtonLink } from "@/ui/button";
import { StatusBadge } from "@/ui/status-badge";
import type { Status } from "@/ui/status-badge";

import { followupBadge } from "../followup-labels";
import { AlertCard } from "../../alert-card";
import { CopySynthesisButton } from "../../copy-synthesis";
import { alertLine, synthesisCopyText } from "../../synthesis-copy";
import { TestMark } from "../test-mark";

import { AccessPanel } from "./access-panel";
import { OwnerLanguageForm } from "./conversation-controls";
import { LiveConversation } from "./live-conversation";
import { readyReplies } from "./ready-replies";
import { NextStepsCard } from "./programme-card";
import { SteeringButtons } from "./steering";

// Titre générique : le nom de l'animal n'apparaît qu'après contrôle d'accès, dans la page.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.dossier.title };
}

type Done = keyof AppDictionary["dossier"]["done"];

function doneKey(value: unknown, t: AppDictionary): Done | undefined {
  return typeof value === "string" && Object.hasOwn(t.dossier.done, value)
    ? (value as Done)
    : undefined;
}

export default async function FollowupPage({
  params,
  searchParams,
}: PageProps<"/app/suivis/[id]">) {
  const { id } = await params;
  const { fait, brouillon } = await searchParams;
  const { t, locale } = await appText();
  const doneCode = doneKey(fait, t);
  const done = doneCode ? t.dossier.done[doneCode] : undefined;
  const context = await memberContext();
  const now = new Date();
  // Une seule transaction pour l'ouverture et les lectures cliniques (ADR 0040).
  // Inexistant, autre cabinet ou non autorisé : même réponse 404, pour ne rien révéler.
  const opened = await services
    .followups()
    .dossier(context, id, async (tx, loaded) => ({
      view: await services.conversations().viewIn(tx, context, loaded),
      attachments: await services.media().readableIn(tx, context, loaded),
      alerts: await services.alerts().ofFollowupIn(tx, context, loaded),
      programme: await services.launch().programmeIn(tx, context, loaded),
      appointments: context.permissions.has("agenda.read")
        ? await services.appointments().ofFollowupIn(tx, context, loaded, now)
        : [],
    }));
  if (!opened) notFound();
  const { followup, record, clinical } = opened;

  const protocolLink =
    followup.access === "clinical" && followup.protocol ? (
      <ProtocolLink
        t={t}
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
      {t.dossier.back}
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
    !clinical ||
    followup.access !== "clinical" ||
    record.access !== "clinical" ||
    followup.status === "draft"
  )
    return (
      <>
        {back}
        {notice}
        <BasicDossier
          t={t}
          locale={locale}
          followup={followup}
          accessPanel={accessPanel}
          protocolLink={protocolLink}
          steering={<Steering t={t} context={context} followup={followup} />}
        />
      </>
    );

  // Dossier clinique d'un suivi lancé : tout est lu dans la base, au moment de l'ouverture ;
  // les liens des fichiers sont signés après la transaction.
  const { view, alerts, programme, appointments } = clinical;
  const links = await services.media().signLinks(context, clinical.attachments);
  const openAlerts = alerts.filter((alert) => alert.status !== "resolved");
  // Brouillon préparé par Stive : posé dans la zone de saisie, jamais envoyé sans clic.
  const draft =
    typeof brouillon === "string"
      ? await services.stive().draftFor(context, brouillon, followup.id)
      : null;
  const ready = await readyReplies(t, context, view);
  const askStive = context.permissions.has("stive.use") ? (
    <ButtonLink
      href={`/app/stive?suivi=${followup.id}`}
      variant="secondary"
      size="sm"
      icon={<Sparkles aria-hidden="true" className="size-4" />}
    >
      {t.stive.askAbout}
    </ButtonLink>
  ) : null;
  const primary = record.contacts.find((contact) => contact.role === "primary");

  return (
    <>
      {back}
      {notice}
      <header className="mb-6 flex flex-wrap items-start gap-4">
        <AnimalAvatar
          name={followup.animalName}
          species={followup.species}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-[1.75rem] leading-tight font-semibold tracking-tight sm:text-[2rem]">
              {followup.animalName}
            </h1>
            <StatusBadge status={dossierStatus(followup, primary)} />
            <PrivateMark t={t} isPrivate={followup.isPrivate} />
            {followup.isTest ? <TestMark /> : null}
          </div>
          <p className="mt-1 text-ink-muted">
            {[
              t.labels.species[followup.species],
              record.facts.animal.breed,
              ageLabel(t, record.facts.animal.birthDate, now),
              weightLabel(locale, record.facts.animal.weightGrams),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">
            {followup.procedure} ·{" "}
            {formatRelativeDayTime(followup.procedureAt, now, locale)} ·{" "}
            {t.dossier.header.day(daysSince(followup.procedureAt, now))} ·{" "}
            {t.dossier.header.responsible}{" "}
            <span className="font-semibold text-ink">
              {followup.responsibleName}
            </span>
          </p>
          {protocolLink ? (
            <p className="mt-0.5 text-sm text-ink-muted">
              {t.dossier.header.protocol} {protocolLink}
            </p>
          ) : null}
        </div>
        {askStive}
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {openAlerts.length ? (
            <section
              aria-label={t.dossier.alertsSection}
              className="grid gap-3"
            >
              {openAlerts.map((alert) => (
                <AlertCard key={alert.id} alert={alert} from="dossier" />
              ))}
            </section>
          ) : null}
          <LiveConversation
            t={t}
            locale={locale}
            view={view}
            links={links}
            draft={draft}
            ready={ready}
            simulatorHref={
              serverEnv().APP_ENV === "local" && !followup.isTest
                ? `/app/suivis/${followup.id}/simulateur`
                : null
            }
          />
          <Steering t={t} context={context} followup={followup} />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {/* La synthèse peut attendre l'IA : le reste du dossier s'affiche sans elle. */}
          <Suspense fallback={<SynthesisPending t={t} />}>
            <SynthesisSection
              t={t}
              locale={locale}
              context={context}
              followup={followup}
              now={now}
            />
          </Suspense>
          <Contacts
            t={t}
            followupId={followup.id}
            contacts={record.contacts}
            view={view}
          />
          <Treatments t={t} treatments={record.facts.treatments} />
          <NextStepsCard
            t={t}
            locale={locale}
            programme={programme}
            controlAppointmentAt={followup.controlAppointmentAt}
            now={now}
          />
          {appointments.length ? (
            <Appointments t={t} locale={locale} appointments={appointments} />
          ) : null}
          <SectionCard
            title={t.dossier.imported.title}
            description={t.dossier.imported.description}
          >
            {record.facts.imported ? (
              <ImportedSummary t={t} imported={record.facts.imported} />
            ) : (
              <p className="text-sm text-ink-muted">
                {t.dossier.imported.none}
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

function ageLabel(
  t: AppDictionary,
  birthDate: string | null,
  now: Date,
): string | null {
  if (!birthDate) return null;
  const [year = 0, month = 1, day = 1] = birthDate.split("-").map(Number);
  let months =
    (now.getUTCFullYear() - year) * 12 + (now.getUTCMonth() + 1 - month);
  if (now.getUTCDate() < day) months -= 1;
  if (months < 0) return null;
  if (months < 12) return t.dossier.header.months(months);
  return t.dossier.header.years(Math.floor(months / 12));
}

const weightFormats: Record<Locale, Intl.NumberFormat> = {
  fr: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }),
  en: new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }),
};

function weightLabel(locale: Locale, grams: number | null): string | null {
  return grams ? `${weightFormats[locale].format(grams / 1000)} kg` : null;
}

function PrivateMark({
  t,
  isPrivate,
}: {
  t: AppDictionary;
  isPrivate: boolean;
}) {
  if (!isPrivate) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted">
      <Lock aria-hidden="true" className="size-3.5" />
      {t.dossier.header.private}
    </span>
  );
}

/** Version de protocole avec laquelle le suivi a été lancé ; elle ne change plus. */
function ProtocolLink({
  t,
  protocol,
  linked,
}: {
  t: AppDictionary;
  protocol: { id: string; name: string; versionNumber: number };
  linked: boolean;
}) {
  const label = t.dossier.header.protocolVersion(
    protocol.name,
    protocol.versionNumber,
  );
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
  t,
  context,
  followup,
}: {
  t: AppDictionary;
  context: MemberContext;
  followup: FollowupView;
}) {
  if (!canPrepareFollowup(context, followup.access)) return null;
  const canSteer = canSteerFollowup(context, followup.access);
  const text = t.dossier.steering;
  if (followup.status === "draft")
    return (
      <SectionCard title={text.draftTitle} description={text.draftDescription}>
        <ButtonLink href={`/app/suivis/${followup.id}/lancement`}>
          {text.openLaunchSheet}
        </ButtonLink>
      </SectionCard>
    );
  if (!canSteer) return null;
  return (
    <SectionCard title={text.title} description={text.description}>
      <div className="grid gap-4">
        {followup.status !== "ended" ? (
          <div>
            <ButtonLink
              href={`/app/suivis/${followup.id}/lancement`}
              variant="secondary"
              size="sm"
            >
              {text.edit}
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
  t,
  locale,
  followup,
  accessPanel,
  protocolLink,
  steering,
}: {
  t: AppDictionary;
  locale: Locale;
  followup: FollowupView;
  accessPanel: ReactNode;
  protocolLink: ReactNode;
  steering: ReactNode;
}) {
  const badge = followupBadge(followup);
  const text = t.dossier.basic;
  return (
    <>
      <header className="mb-6 flex flex-wrap items-start gap-4">
        <AnimalAvatar
          name={followup.animalName}
          species={followup.species}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-[1.75rem] leading-tight font-semibold tracking-tight sm:text-[2rem]">
              {followup.animalName}
            </h1>
            {badge ? <StatusBadge status={badge} /> : null}
            <PrivateMark t={t} isPrivate={followup.isPrivate} />
            {followup.isTest ? <TestMark /> : null}
          </div>
          <p className="mt-1 text-ink-muted">
            {t.labels.species[followup.species]} ·{" "}
            {t.dossier.header.responsible}{" "}
            <span className="font-semibold text-ink">
              {followup.responsibleName}
            </span>
          </p>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <SectionCard title={text.organization}>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Fact label={text.owner} value={followup.ownerName ?? "—"} />
              <Fact
                label={text.status}
                value={t.labels.followupStatus[followup.status]}
              />
              <Fact
                label={text.start}
                value={
                  followup.startedAt
                    ? formatDate(followup.startedAt, locale)
                    : "—"
                }
              />
              <Fact
                label={text.control}
                value={
                  followup.controlAppointmentAt
                    ? formatDate(followup.controlAppointmentAt, locale)
                    : text.notScheduled
                }
              />
            </dl>
          </SectionCard>
          {followup.access === "clinical" ? (
            <SectionCard title={text.intervention}>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <Fact label={text.procedure} value={followup.procedure} />
                <Fact
                  label={text.date}
                  value={formatDate(followup.procedureAt, locale)}
                />
                {protocolLink ? (
                  <div className="sm:col-span-2">
                    <dt className="text-ink-muted">{text.protocol}</dt>
                    <dd>{protocolLink}</dd>
                  </div>
                ) : null}
              </dl>
            </SectionCard>
          ) : (
            <AlertBanner tone="info" title={text.restrictedTitle}>
              {text.restricted}
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

/** Synthèse pré-consultation (§9) : rédigée par l'IA (simulée), sous garde-fous. */
/** Synthèse rédigée dans la langue de la personne qui la lit. */
async function SynthesisSection({
  t,
  locale,
  context,
  followup,
  now,
}: {
  t: AppDictionary;
  locale: Locale;
  context: MemberContext;
  followup: {
    id: string;
    animalName: string;
    procedure: string;
    procedureAt: Date;
  };
  now: Date;
}) {
  const synthesis = await services
    .synthesis()
    .forFollowup(context, followup.id, { now, language: locale });
  return (
    <Synthesis
      t={t}
      locale={locale}
      synthesis={synthesis}
      copy={
        synthesis ? (
          <CopySynthesisButton
            followupId={followup.id}
            animalName={followup.animalName}
            text={synthesisCopyText(t, locale, synthesis, {
              animalName: followup.animalName,
              procedure: followup.procedure,
              day: daysSince(followup.procedureAt, now),
            })}
          />
        ) : null
      }
    />
  );
}

function SynthesisPending({ t }: { t: AppDictionary }) {
  const text = t.dossier.synthesis;
  return (
    <SectionCard title={text.title} description={text.description}>
      <p role="status" className="text-sm text-ink-muted">
        {t.auth.pending}
      </p>
    </SectionCard>
  );
}

function Synthesis({
  t,
  locale,
  synthesis,
  copy,
}: {
  t: AppDictionary;
  locale: Locale;
  synthesis: SynthesisView | null;
  /** « Copier pour dr.veto » : presse-papiers seulement (ADR 0048). */
  copy: ReactNode;
}) {
  const text = t.dossier.synthesis;
  return (
    <SectionCard
      title={text.title}
      description={text.description}
      action={copy}
    >
      {synthesis ? (
        <div className="grid gap-4 text-sm">
          <p className="text-ink-muted">
            {text.exchanges(
              synthesis.exchanges.ownerMessages,
              synthesis.exchanges.photos,
              synthesis.exchanges.voiceNotes,
            )}
          </p>
          <p>{synthesis.evolution}</p>
          <SignalList
            title={text.positives}
            items={synthesis.positives}
            tone="brand"
          />
          <SignalList
            title={text.negatives}
            items={synthesis.negatives}
            tone="urgent"
          />
          <SignalList
            title={text.alerts}
            items={synthesis.alerts.map((alert) => alertLine(t, locale, alert))}
            tone="urgent"
          />
          <SignalList
            title={text.openQuestions}
            items={synthesis.openQuestions}
            tone="neutral"
          />
          {synthesis.withheld > 0 ? (
            <p className="text-ink-muted">
              {text.withheld(synthesis.withheld)}
            </p>
          ) : null}
          <p className="text-xs text-ink-muted">
            {text.generated(formatDateTime(synthesis.generatedAt, locale))}
          </p>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">{text.empty}</p>
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

/**
 * Propriétaires et accord : jamais le numéro complet, seulement ses deux derniers chiffres.
 * La langue de Numa avec chacun indique sa provenance ; un vétérinaire qui peut reprendre
 * Numa peut la corriger (le service revérifie ce droit).
 */
function Contacts({
  t,
  followupId,
  contacts,
  view,
}: {
  t: AppDictionary;
  followupId: string;
  contacts: FollowupContactView[];
  view: ConversationView;
}) {
  const text = t.dossier.contacts;
  const active = contacts.filter((contact) => contact.active);
  const canCorrectLanguage = view.rights.canResume;
  return (
    <SectionCard
      title={text.title}
      description={
        active.length > 1
          ? view.group
            ? text.groupOpen
            : text.groupLater
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
                  · {contact.role === "primary" ? text.primary : text.secondary}
                </span>
              </span>
              <span className="block text-ink-muted">
                {contact.phoneEnding
                  ? text.phoneEnding(contact.phoneEnding)
                  : text.whatsapp}{" "}
                ·{" "}
                {text.language(
                  text.languageNames[contact.language],
                  t.labels.languageSources[contact.languageSource],
                )}
              </span>
            </span>
            <StatusBadge
              status={
                contact.consent
                  ? CONSENT_STATUS[contact.consent]
                  : "consent-pending"
              }
            />
            {canCorrectLanguage ? (
              <div className="w-full">
                <OwnerLanguageForm
                  followupId={followupId}
                  role={contact.role}
                  firstName={
                    view.contacts.find((item) => item.role === contact.role)
                      ?.firstName ?? contact.name
                  }
                  language={contact.language}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

/** Rendez-vous à venir de ce suivi : proposés par Numa (à confirmer) ou confirmés. */
function Appointments({
  t,
  locale,
  appointments,
}: {
  t: AppDictionary;
  locale: Locale;
  appointments: Awaited<ReturnType<AppointmentsService["ofFollowup"]>>;
}) {
  const text = t.dossier.appointments;
  return (
    <SectionCard
      title={text.title}
      description={text.description}
      headingLevel={2}
    >
      <ul className="grid gap-3 text-sm">
        {appointments.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span>
              <span className="block font-semibold">
                {formatDateTime(item.startsAt, locale)}
              </span>
              <span className="block text-ink-muted">
                {t.labels.appointmentKinds[item.kind]}
                {item.source === "numa" ? ` · ${text.chosenWithNuma}` : ""}
              </span>
            </span>
            {item.status === "proposed" ? (
              <Link
                href="/app/agenda"
                className="font-semibold text-brand-ink underline-offset-2 hover:underline"
              >
                {text.toConfirm}
              </Link>
            ) : (
              <span className="font-semibold text-brand-ink">
                {text.confirmed}
              </span>
            )}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

/** Traitements validés ; ceux importés et pas encore validés ne sont jamais rappelés. */
function Treatments({
  t,
  treatments,
}: {
  t: AppDictionary;
  treatments: TreatmentView[];
}) {
  const text = t.dossier.treatments;
  const validated = treatments.filter((treatment) => treatment.validatedBy);
  const pending = treatments.length - validated.length;
  return (
    <SectionCard title={text.title} headingLevel={2}>
      {validated.length > 0 ? (
        <ul className="grid gap-3">
          {validated.map((treatment) => (
            <li key={treatment.id} className="text-sm">
              <p className="font-semibold">
                {treatment.name}
                {treatment.source === "drveto"
                  ? ` ${text.importedFromDrveto}`
                  : ""}
              </p>
              <p className="text-ink-muted">
                {treatment.instructions} ·{" "}
                {text.validatedBy(shortPersonName(treatment.validatedBy ?? ""))}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">{text.none}</p>
      )}
      {pending > 0 ? (
        <p className="mt-3 text-sm font-medium text-watch">
          {text.pending(pending)}
        </p>
      ) : null}
      <p className="mt-3 text-xs text-ink-muted">{text.noDosage}</p>
    </SectionCard>
  );
}

function ImportedSummary({
  t,
  imported,
}: {
  t: AppDictionary;
  imported: { allergies: string[]; antecedents: string[] };
}) {
  const allergies = imported.allergies.length
    ? imported.allergies
    : [t.dossier.imported.noAllergy];
  return (
    <div className="grid gap-3 text-sm">
      <ul className="list-inside list-disc">
        {allergies.map((allergy) => (
          <li key={allergy}>{allergy}</li>
        ))}
      </ul>
      {imported.antecedents.length ? (
        <div>
          <h3 className="mb-1 font-semibold">
            {t.dossier.imported.antecedents}
          </h3>
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
