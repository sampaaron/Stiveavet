import {
  ArrowRight,
  FolderOpen,
  MessageSquareText,
  PawPrint,
} from "lucide-react";
import type { Metadata } from "next";

import type { PermissionKey } from "@/domains/equipe/permissions";
import { daysSince } from "@/domains/suivis/calendrier";
import type {
  DashboardAgendaItem,
  DashboardFollowup,
  DashboardSummary,
} from "@/domains/suivis/tableau";
import type { AgendaEvent as AgendaEventData } from "@/fixtures/types";
import { AgendaEvent } from "@/ui/agenda-event";
import { AlertBanner } from "@/ui/alert-banner";
import { AssistantCard } from "@/ui/assistant-card";
import { ButtonLink } from "@/ui/button";
import { CapacityMeter } from "@/ui/capacity-meter";
import { Card, SectionCard, StatCard } from "@/ui/card";
import { memberProfile } from "@/server/auth/profile";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";
import { FollowupCard } from "@/ui/followup-card";
import type { FollowupCardData } from "@/ui/followup-card";
import {
  formatDayTitle,
  formatDuration,
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

export default async function TodayPage() {
  const context = await memberContext();
  const can = (permission: PermissionKey) =>
    context.permissions.has(permission);
  const profile = await memberProfile(context);
  const { t, locale } = await appText();
  const text = t.dashboard;
  const now = new Date();
  // Suivis visibles selon les droits ; le détail clinique seulement avec l'accès clinique.
  const today = await services.today().today(context, now);
  const { views } = today;
  if (views.length === 0 && today.activeFollowups === 0)
    return (
      <>
        <PageHeader
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

  return (
    <>
      <PageHeader
        title={text.greeting(profile.firstName)}
        description={
          clinical
            ? text.headline(todayLabel, urgent.length, watch.length)
            : todayLabel
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
        {urgent.map((followup) => {
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
        })}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {clinical ? (
            <>
              <StatCard
                label={text.stats.urgent}
                value={urgent.length}
                tone="urgent"
                hint={text.stats.urgentHint}
              />
              <StatCard
                label={text.stats.watch}
                value={watch.length}
                tone="watch"
                hint={text.stats.watchHint}
              />
            </>
          ) : null}
          <Card className="p-5">
            <p className="text-sm font-medium text-ink-muted">
              {text.stats.active}
            </p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-brand-ink tabular-nums">
              {today.activeFollowups} / {today.includedFollowups}
            </p>
            <div className="mt-2">
              <CapacityMeter
                used={today.activeFollowups}
                included={today.includedFollowups}
              />
            </div>
          </Card>
          <StatCard
            label={text.stats.appointments}
            value={today.stiveaAppointments}
            hint={text.stats.appointmentsHint}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            {clinical ? (
              <>
                <SectionCard
                  title={text.priorities.title}
                  description={text.priorities.description}
                >
                  {urgent.length + watch.length > 0 ? (
                    <ul className="-mx-3">
                      {[...urgent, ...watch].map((followup) => (
                        <li key={followup.id}>
                          <FollowupCard
                            followup={toCard(t, locale, followup, now)}
                          />
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
                        <FollowupCard
                          followup={toCard(t, locale, followup, now)}
                        />
                      </li>
                    ))}
                  </ul>
                  {others.length === 0 ? (
                    <EmptyState title={text.others.empty} />
                  ) : null}
                </SectionCard>
              </>
            ) : (
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
                          <span className="font-semibold">
                            {view.animalName}
                          </span>
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
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            {today.agenda ? (
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
            ) : null}

            <SectionCard title={text.quickActions}>
              <div className="grid gap-2">
                {can("followups.launch") ? (
                  <ButtonLink
                    href="/app/suivis/nouveau"
                    variant="secondary"
                    className="justify-start"
                  >
                    <PawPrint aria-hidden="true" className="size-4" />
                    {text.actions.launch}
                  </ButtonLink>
                ) : null}
                {views.length > 0 ? (
                  <ButtonLink
                    href="/app/suivis"
                    variant="secondary"
                    className="justify-start"
                  >
                    <FolderOpen aria-hidden="true" className="size-4" />
                    {text.actions.openAFile}
                  </ButtonLink>
                ) : null}
                {can("owner_messages.reply") && visible[0] ? (
                  <ButtonLink
                    href={`/app/suivis/${urgent[0]?.id ?? visible[0].id}`}
                    variant="secondary"
                    className="justify-start"
                  >
                    <MessageSquareText aria-hidden="true" className="size-4" />
                    {text.actions.writeToOwner}
                  </ButtonLink>
                ) : null}
              </div>
            </SectionCard>

            <AssistantCard assistant="numa">
              {text.numa(today.activeFollowups)}
            </AssistantCard>
            {can("stive.use") ? (
              <AssistantCard assistant="stive">{text.stive}</AssistantCard>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
