import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BellRing,
  CalendarCheck,
  CalendarClock,
  ClipboardPen,
  CalendarDays,
  CircleAlert,
  Eye,
  FolderOpen,
  MessageSquareText,
  MessagesSquare,
  PawPrint,
  Plus,
  Search,
  Sparkles,
  Timer,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import type { PermissionKey } from "@/domains/equipe/permissions";
import type { StiveBriefing } from "@/domains/stive/service";
import { daysSince } from "@/domains/suivis/calendrier";
import type { ActivityStats } from "@/domains/suivis/statistiques";
import {
  CHECK_IN_CALL_MINUTES,
  LAUNCH_MINUTES,
  timeSaved,
} from "@/domains/suivis/temps-gagne";
import type {
  DashboardAgendaItem,
  DashboardFollowup,
  DashboardSummary,
  TodayView,
} from "@/domains/suivis/tableau";
import type { AgendaEvent as AgendaEventData } from "@/ui/types";
import { AgendaEvent } from "@/ui/agenda-event";
import { AlertBanner } from "@/ui/alert-banner";
import { AiBadge, AssistantAvatar } from "@/ui/assistant-card";
import { ButtonLink } from "@/ui/button";
import { CapacityMeter } from "@/ui/capacity-meter";
import { Card, SectionCard, StatGrid, StatTile } from "@/ui/card";
import { memberProfile } from "@/server/auth/profile";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";
import { FollowupCard } from "@/ui/followup-card";
import type { FollowupCardData } from "@/ui/followup-card";
import {
  formatDayTitle,
  formatDuration,
  formatMinutes,
  formatRelativeMoment,
  formatTime,
  shortPersonName,
} from "@/ui/format";
import { appText } from "@/i18n/app/server";
import type { AppDictionary } from "@/i18n/app/types";
import type { Locale } from "@/i18n/locales";
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";
import { StatusBadge } from "@/ui/status-badge";
import type { Status } from "@/ui/status-badge";

import { ActivityPanel, NextActions } from "./activity-panel";
import { ReadyQueue } from "./ready-queue";
import { AskStiveBar } from "./stive/stive-forms";
import { triageReasonText } from "./triage-reason";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.dashboard.title };
}

/** Propos du propriétaire, cités, avec la pièce jointe éventuelle. */
function ownerLine(
  t: AppDictionary,
  owner: { text: string | null; media: "photo" | "voice" | null },
): string {
  const words = t.dashboard.owner;
  if (!owner.text)
    return owner.media === "photo"
      ? words.photoOnly
      : owner.media === "voice"
        ? words.voiceOnly
        : words.messageOnly;
  const media =
    owner.media === "photo"
      ? words.photo
      : owner.media === "voice"
        ? words.voice
        : null;
  return media ? words.quoteWith(owner.text, media) : words.quote(owner.text);
}

/** Ligne d'un suivi : ce qui a changé en dernier, en une phrase. */
function summaryLine(t: AppDictionary, summary: DashboardSummary): string {
  const lines = t.dashboard.summary;
  switch (summary.kind) {
    case "alert":
      return summary.owner
        ? ownerLine(t, summary.owner)
        : triageReasonText(t, summary.reason);
    case "paused":
      return lines.paused;
    case "human_takeover":
      return lines.humanTakeover;
    case "consent_withdrawn":
      return lines.consentWithdrawn;
    case "consent_requested":
      return lines.consentRequested;
    case "not_started":
      return lines.notStarted;
    case "owner":
      return ownerLine(t, summary);
    default:
      return lines.quiet;
  }
}

/** Statut principal : la gravité prime, puis la pause, puis l'accord attendu. */
function cardStatus(followup: DashboardFollowup): Status {
  if (followup.triage !== "normal") return followup.triage;
  if (followup.status === "paused") return "paused";
  if (followup.consent !== "given" && followup.consent !== "withdrawn")
    return "consent-pending";
  return "normal";
}

function toCard(
  t: AppDictionary,
  locale: Locale,
  followup: DashboardFollowup,
  now: Date,
): FollowupCardData {
  return {
    id: followup.id,
    animalName: followup.animalName,
    species: followup.species === "cat" ? "chat" : "chien",
    status: cardStatus(followup),
    summaryLine: summaryLine(t, followup.summary),
    procedure: followup.procedure,
    dayLabel: t.dashboard.dayLabel(daysSince(followup.procedureAt, now)),
    vetName: shortPersonName(followup.responsibleName),
    lastActivity: followup.lastActivityAt
      ? formatRelativeMoment(followup.lastActivityAt, now, locale)
      : "—",
  };
}

function toAgendaEvent(
  t: AppDictionary,
  locale: Locale,
  item: DashboardAgendaItem,
): AgendaEventData {
  return {
    id: item.id,
    time: formatTime(item.startsAt, locale),
    duration: formatDuration(item.startsAt, item.endsAt, locale),
    // Le titre d'un rendez-vous dr.veto est affiché tel que dr.veto le donne.
    title:
      "appointment" in item.title
        ? t.dashboard.agenda.appointment(
            item.title.appointment === "other"
              ? t.dashboard.agenda.otherAppointment
              : t.labels.appointmentKinds[item.title.appointment],
            item.title.animalName,
          )
        : item.title.text,
    vetId: item.vetName,
    kind: item.kind,
    fromStivea: item.fromStivea,
    pending: item.pending,
    followupId: item.followupId ?? undefined,
  };
}

/**
 * Ce que Stive a relevé pour l'équipe : alertes sans accusé, rendez-vous à confirmer, fiches
 * à finir. Des raccourcis, jamais une décision : chaque lien ouvre l'écran où l'on décide.
 */
function stiveChips(t: AppDictionary, briefing: StiveBriefing): Chip[] {
  const words = t.stive;
  return [
    briefing.unacknowledged
      ? {
          href: "/app/alertes",
          icon: BellRing,
          label: words.briefing.unacknowledged(briefing.unacknowledged),
        }
      : null,
    briefing.pendingAppointments
      ? {
          href: "/app/agenda",
          icon: CalendarClock,
          label: words.briefing.pendingAppointments(
            briefing.pendingAppointments,
          ),
        }
      : null,
    briefing.drafts.length
      ? {
          href: "/app/suivis",
          icon: ClipboardPen,
          label: words.dashboard.drafts(briefing.drafts.length),
        }
      : null,
  ].filter((chip) => chip !== null);
}

/** Prochain rendez-vous de l'agenda lu par Stive, en une ligne. */
function nextAppointmentLine(
  t: AppDictionary,
  locale: Locale,
  briefing: StiveBriefing,
  now: Date,
): string | null {
  const next = briefing.agenda?.find(
    (item) => new Date(item.startsAt).getTime() > now.getTime(),
  );
  if (!next) return null;
  return t.stive.dashboard.nextAppointment(
    formatTime(new Date(next.startsAt), locale),
    "appointment" in next.title
      ? t.dashboard.agenda.appointment(
          next.title.appointment === "other"
            ? t.dashboard.agenda.otherAppointment
            : t.labels.appointmentKinds[next.title.appointment],
          next.title.animalName,
        )
      : next.title.text,
  );
}

type Chip = { href: string; label: string; icon: LucideIcon };

/** Raccourcis sous le point du jour, selon les droits et ce qu'il y a à faire. */
function quickActions(
  t: AppDictionary,
  can: (permission: PermissionKey) => boolean,
  today: TodayView,
  urgent: DashboardFollowup[],
): Chip[] {
  const text = t.dashboard;
  return [
    can("followups.launch")
      ? {
          href: "/app/animaux/nouveau",
          label: text.actions.newAnimal,
          icon: Plus,
        }
      : null,
    can("owner_messages.reply") && today.followups[0]
      ? {
          href: `/app/suivis/${urgent[0]?.id ?? today.followups[0].id}`,
          label: text.actions.writeToOwner,
          icon: MessageSquareText,
        }
      : null,
    today.views.length > 0
      ? {
          href: "/app/suivis",
          label: text.actions.allFollowups,
          icon: FolderOpen,
        }
      : null,
    today.agenda
      ? { href: "/app/agenda", label: text.actions.agenda, icon: CalendarDays }
      : null,
  ].filter((chip) => chip !== null);
}

/**
 * En tête du tableau de bord : le point de Stive, l'assistant IA de l'équipe (décomptes du
 * jour, ce qui attend une décision, une demande en une ligne). Sans Stive dans la formule ou
 * dans les droits, le même point du jour, sans assistant, avec la recherche des suivis.
 */
function TodayBriefing({
  t,
  locale,
  now,
  clinical,
  today,
  urgent,
  watch,
  canSearch,
  chips,
  stive,
  stats,
}: {
  t: AppDictionary;
  locale: Locale;
  now: Date;
  clinical: boolean;
  today: TodayView;
  urgent: number;
  watch: number;
  canSearch: boolean;
  chips: Chip[];
  stive: StiveBriefing | null;
  stats: ActivityStats;
}) {
  const text = t.dashboard;
  const saved = timeSaved(stats);
  const links = stive ? [...stiveChips(t, stive), ...chips] : chips;
  const next = stive ? nextAppointmentLine(t, locale, stive, now) : null;
  return (
    <section
      aria-labelledby="point-du-jour"
      className="relative isolate overflow-hidden rounded-[var(--radius-panel)] bg-night-soft p-5 text-white shadow-[0_1px_2px_rgb(11_18_32/0.08),0_28px_56px_-28px_rgb(8_19_15/0.7)] sm:p-8"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-28 -right-20 -z-10 size-80 rounded-full bg-[conic-gradient(from_200deg,#8ce8c3,#5b4fe0,#f5c46b,#8ce8c3)] opacity-20 blur-3xl"
      />
      <div className="flex items-start gap-4">
        {stive ? (
          <AssistantAvatar
            assistant="stive"
            size={64}
            className="size-12 ring-2 ring-mint/50 sm:size-16"
          />
        ) : null}
        <div className="min-w-0">
          <h2
            id="point-du-jour"
            className="flex flex-wrap items-center gap-2 text-sm font-semibold text-mint"
          >
            {stive ? t.stive.dashboard.title : text.briefing.title}
            {stive ? <AiBadge assistant="stive" onDark /> : null}
          </h2>
          <p className="mt-2 max-w-3xl font-display text-xl leading-snug font-semibold tracking-[-0.01em] text-balance sm:text-[1.5rem]">
            {clinical
              ? text.briefing.clinical(today.activeFollowups, urgent, watch)
              : text.briefing.summary(today.activeFollowups)}
          </p>
          {stive ? (
            <p className="mt-2 text-sm text-white/70">
              {t.stive.dashboard.promise}
              {next ? ` ${next}` : null}
            </p>
          ) : null}
          {saved.minutes > 0 ? (
            <p className="mt-3 flex items-start gap-2 text-sm text-white/85">
              <Timer
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-mint"
              />
              <span>
                {text.timeSaved.line(
                  formatMinutes(saved.minutes, locale),
                  saved.checkIns,
                )}{" "}
                <span className="text-white/60">
                  {text.timeSaved.how(CHECK_IN_CALL_MINUTES, LAUNCH_MINUTES)}
                </span>
              </span>
            </p>
          ) : null}
        </div>
      </div>
      {stive ? (
        <AskStiveBar placeholder={t.stive.dashboard.askPlaceholder} />
      ) : canSearch ? (
        <form action="/app/suivis" role="search" className="relative mt-5">
          <label htmlFor="recherche-globale" className="sr-only">
            {t.shell.search.label}
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-5 size-5 -translate-y-1/2 text-ink-muted"
          />
          <input
            id="recherche-globale"
            name="q"
            type="search"
            autoComplete="off"
            maxLength={80}
            placeholder={text.briefing.searchPlaceholder}
            className="h-14 w-full rounded-full border border-white/20 bg-surface pr-16 pl-13 text-[15px] text-ink shadow-[0_10px_30px_-12px_rgb(0_0_0/0.5)] placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          />
          <button
            type="submit"
            className="absolute top-1/2 right-2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-strong text-white shadow-[0_6px_16px_-6px_rgb(8_122_84/0.8)] transition-transform hover:scale-105"
          >
            <ArrowRight aria-hidden="true" className="size-5" />
            <span className="sr-only">{text.briefing.searchSubmit}</span>
          </button>
        </form>
      ) : null}
      {links.length > 0 || stive ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {links.map(({ href, label, icon: Icon }) => (
            <li key={`${href}-${label}`}>
              <Link
                href={href}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 text-sm font-medium text-white transition-all hover:-translate-y-0.5 hover:bg-white/14 focus-visible:outline-mint"
              >
                <Icon aria-hidden="true" className="size-4 text-mint" />
                {label}
              </Link>
            </li>
          ))}
          {stive ? (
            <li>
              <Link
                href="/app/stive"
                className="inline-flex min-h-10 items-center gap-2 rounded-full bg-mint px-4 text-sm font-bold text-night transition-colors hover:bg-white focus-visible:outline-mint"
              >
                <Sparkles aria-hidden="true" className="size-4" />
                {t.stive.dashboard.open}
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * Numa, en retrait : son rôle est auprès des propriétaires. Une ligne pour rappeler ce qu'elle
 * fait pour le cabinet, sans décompte ni avis.
 */
function NumaNote({ t, active }: { t: AppDictionary; active: number }) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-panel)] border border-line/70 bg-surface/60 px-4 py-3 text-sm text-ink-muted">
      <AssistantAvatar assistant="numa" size={32} className="size-8" />
      <p className="min-w-0">
        <span className="font-semibold text-ink">{t.dashboard.numa.title}</span>{" "}
        <AiBadge assistant="numa" /> {t.dashboard.numa.text(active)}
      </p>
    </div>
  );
}

/** Un bandeau par suivi urgent, en tête de page. */
function UrgentBanners({
  t,
  locale,
  now,
  urgent,
}: {
  t: AppDictionary;
  locale: Locale;
  now: Date;
  urgent: DashboardFollowup[];
}) {
  const text = t.dashboard;
  return urgent.map((followup) => {
    const card = toCard(t, locale, followup, now);
    return (
      <AlertBanner
        key={followup.id}
        tone="urgent"
        title={
          followup.summary.kind === "alert"
            ? text.urgentReportedAt(
                followup.animalName,
                formatTime(followup.summary.at, locale),
              )
            : text.urgentOngoing(followup.animalName)
        }
        action={
          <ButtonLink href={`/app/suivis/${followup.id}`} size="sm">
            {text.actions.openFile}
          </ButtonLink>
        }
      >
        {card.summaryLine} · {followup.procedure} · {card.dayLabel} ·{" "}
        {card.vetName}.
      </AlertBanner>
    );
  });
}

/** Chiffres du jour ; urgences et cas à surveiller seulement avec l'accès clinique. */
function TodayStats({
  t,
  clinical,
  today,
  urgent,
  watch,
}: {
  t: AppDictionary;
  clinical: boolean;
  today: TodayView;
  urgent: number;
  watch: number;
}) {
  const text = t.dashboard;
  return (
    <StatGrid>
      {clinical ? (
        <>
          <StatTile
            label={text.stats.urgent}
            value={urgent}
            tone="urgent"
            hint={text.stats.urgentHint}
            icon={<CircleAlert className="size-4" />}
          />
          <StatTile
            label={text.stats.watch}
            value={watch}
            tone="watch"
            hint={text.stats.watchHint}
            icon={<Eye className="size-4" />}
          />
        </>
      ) : null}
      <StatTile
        label={text.stats.active}
        value={`${today.activeFollowups} / ${today.includedFollowups}`}
        tone="brand"
        icon={<MessagesSquare className="size-4" />}
      >
        <CapacityMeter
          used={today.activeFollowups}
          included={today.includedFollowups}
        />
      </StatTile>
      <StatTile
        label={text.stats.appointments}
        value={today.stiveaAppointments}
        hint={text.stats.appointmentsHint}
        icon={<CalendarCheck className="size-4" />}
      />
    </StatGrid>
  );
}

/** Suivis prioritaires (urgents puis à surveiller), puis les autres. */
function ClinicalLists({
  t,
  locale,
  now,
  priorities,
  others,
}: {
  t: AppDictionary;
  locale: Locale;
  now: Date;
  priorities: DashboardFollowup[];
  others: DashboardFollowup[];
}) {
  const text = t.dashboard;
  return (
    <>
      <SectionCard
        title={text.priorities.title}
        description={text.priorities.description}
      >
        {priorities.length > 0 ? (
          <ul className="-mx-3">
            {priorities.map((followup) => (
              <li key={followup.id}>
                <FollowupCard followup={toCard(t, locale, followup, now)} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title={text.priorities.emptyTitle}
            description={text.priorities.emptyDescription}
          />
        )}
      </SectionCard>

      <SectionCard
        title={text.others.title}
        action={
          <ButtonLink href="/app/suivis" variant="quiet" size="sm">
            {text.actions.allFollowups}
            <ArrowRight aria-hidden="true" className="size-4" />
          </ButtonLink>
        }
      >
        <ul className="-mx-3">
          {others.map((followup) => (
            <li key={followup.id}>
              <FollowupCard followup={toCard(t, locale, followup, now)} />
            </li>
          ))}
        </ul>
        {others.length === 0 ? <EmptyState title={text.others.empty} /> : null}
      </SectionCard>
    </>
  );
}

/** Sans accès clinique : la liste des suivis, sans détail. */
function OrganizationList({
  t,
  views,
}: {
  t: AppDictionary;
  views: TodayView["views"];
}) {
  const text = t.dashboard;
  return (
    <SectionCard
      title={text.organization.title}
      description={text.organization.description}
      action={
        <ButtonLink href="/app/suivis" variant="quiet" size="sm">
          {text.actions.allFollowups}
          <ArrowRight aria-hidden="true" className="size-4" />
        </ButtonLink>
      }
    >
      {views.length > 0 ? (
        <ul className="grid gap-3">
          {views.map((view) => (
            <li
              key={view.id}
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span>
                <span className="font-semibold">{view.animalName}</span>
                <span className="text-ink-muted">
                  {" "}
                  · {view.responsibleName}
                </span>
              </span>
              {view.status === "paused" ? (
                <StatusBadge status="paused" />
              ) : (
                <span className="text-ink-muted">
                  {t.labels.followupStatus[view.status]}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={text.organization.empty} />
      )}
    </SectionCard>
  );
}

/** Agenda du jour, lu dans le logiciel du cabinet. */
function TodayAgenda({
  t,
  locale,
  agenda,
}: {
  t: AppDictionary;
  locale: Locale;
  agenda: AgendaEventData[];
}) {
  const text = t.dashboard;
  return (
    <SectionCard
      title={text.agenda.title}
      description={text.agenda.description}
      action={
        <ButtonLink href="/app/agenda" variant="quiet" size="sm">
          {text.actions.agenda}
          <ArrowRight aria-hidden="true" className="size-4" />
        </ButtonLink>
      }
    >
      {agenda.length > 0 ? (
        <ol className="flex flex-col gap-2">
          {agenda.map((event) => (
            <li key={event.id}>
              <AgendaEvent
                event={event}
                vetName={shortPersonName(event.vetId)}
                locale={locale}
              />
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState
          title={text.agenda.emptyTitle}
          description={text.agenda.emptyDescription}
        />
      )}
    </SectionCard>
  );
}

export default async function TodayPage({ searchParams }: PageProps<"/app">) {
  const context = await memberContext();
  const can = (permission: PermissionKey) =>
    context.permissions.has(permission);
  const profile = await memberProfile(context);
  const { t, locale } = await appText();
  const text = t.dashboard;
  const now = new Date();
  // Suivis visibles selon les droits ; le détail clinique seulement avec l'accès clinique.
  const [today, stats] = await Promise.all([
    services.today().today(context, now, context),
    services.stats().activity(context, now),
  ]);
  // File « Prêts à lancer » (ADR 0046) : pour qui prépare les fiches avec l'accès clinique.
  const [ready, { lances, echecs }] = await Promise.all([
    can("followups.launch") && can("clinical.read")
      ? services.launch().readyQueue(context)
      : Promise.resolve([]),
    searchParams,
  ]);
  const launchedNow = Number(lances);
  const failedNow = Number(echecs);
  const launchNotice =
    Number.isSafeInteger(launchedNow) &&
    Number.isSafeInteger(failedNow) &&
    launchedNow >= 0 &&
    failedNow >= 0 &&
    launchedNow + failedNow > 0
      ? text.ready.done(launchedNow, failedNow)
      : null;
  // Le point de Stive reprend la vue déjà lue : ni demande comptée, ni échange enregistré.
  const briefing = can("stive.use")
    ? await services.stive().briefing(context, now, today)
    : null;
  const { views } = today;
  if (views.length === 0 && today.activeFollowups === 0)
    return (
      <>
        <PageHeader
          eyebrow={formatDayTitle(now, locale)}
          title={text.greeting(profile.firstName)}
          description={profile.organizationName}
        />
        <Card>
          <EmptyState
            title={text.empty.title}
            description={
              can("organization.settings")
                ? text.empty.admin
                : text.empty.member
            }
            action={
              can("organization.settings") ? (
                <ButtonLink href="/app/demarrage">
                  {text.empty.guidedSetup}
                </ButtonLink>
              ) : null
            }
          />
        </Card>
      </>
    );

  const clinical = can("clinical.read");
  const visible = today.followups;
  const urgent = visible.filter((followup) => followup.triage === "urgent");
  const watch = visible.filter((followup) => followup.triage === "watch");
  const others = visible.filter((followup) => followup.triage === "normal");
  const todayLabel = formatDayTitle(now, locale);
  const agenda =
    today.agenda?.map((item) => toAgendaEvent(t, locale, item)) ?? [];

  const canSearch =
    can("followups.read_all") ||
    can("followups.read_own") ||
    can("followups.read_summary");
  const chips = quickActions(t, can, today, urgent);

  return (
    <>
      <PageHeader
        eyebrow={todayLabel}
        title={text.greeting(profile.firstName)}
        description={
          clinical
            ? text.headlineShort(urgent.length, watch.length)
            : profile.organizationName
        }
        actions={
          <>
            {views.length > 0 ? (
              <ButtonLink
                href="/app/suivis"
                variant="secondary"
                icon={<FolderOpen aria-hidden="true" className="size-4" />}
              >
                {text.actions.openAFile}
              </ButtonLink>
            ) : null}
            {can("followups.launch") ? (
              <ButtonLink
                href="/app/suivis/nouveau"
                icon={<PawPrint aria-hidden="true" className="size-4" />}
              >
                {text.actions.launch}
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6">
        <TodayBriefing
          t={t}
          locale={locale}
          now={now}
          clinical={clinical}
          today={today}
          urgent={urgent.length}
          watch={watch.length}
          canSearch={canSearch}
          chips={chips}
          stive={briefing}
          stats={stats}
        />

        {launchNotice ? (
          <p
            role="status"
            className="rounded-[var(--radius-card)] bg-brand-soft px-4 py-3 text-sm font-medium text-brand-ink"
          >
            {launchNotice}
          </p>
        ) : null}

        <UrgentBanners t={t} locale={locale} now={now} urgent={urgent} />

        <TodayStats
          t={t}
          clinical={clinical}
          today={today}
          urgent={urgent.length}
          watch={watch.length}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            {ready.length > 0 ? <ReadyQueue drafts={ready} now={now} /> : null}
            {clinical ? (
              <ClinicalLists
                t={t}
                locale={locale}
                now={now}
                priorities={[...urgent, ...watch]}
                others={others}
              />
            ) : (
              <OrganizationList t={t} views={views} />
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            {today.agenda ? (
              <TodayAgenda t={t} locale={locale} agenda={agenda} />
            ) : null}

            <NextActions
              stats={stats}
              t={t}
              links={{ followups: views.length > 0, alerts: clinical }}
            />

            {today.activeFollowups > 0 ? (
              <NumaNote t={t} active={today.activeFollowups} />
            ) : null}
          </div>
        </div>

        <ActivityPanel stats={stats} t={t} locale={locale} />
      </div>
    </>
  );
}
