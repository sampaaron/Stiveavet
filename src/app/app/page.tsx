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
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";
import { StatusBadge } from "@/ui/status-badge";
import type { Status } from "@/ui/status-badge";

import { FOLLOWUP_STATUS_LABELS } from "./suivis/followup-labels";

export const metadata: Metadata = { title: "Aujourd'hui" };

/** Ligne d'un suivi : ce qui a changé en dernier, en une phrase. */
/** Propos du propriétaire, cités, avec la pièce jointe éventuelle. */
function ownerLine(owner: {
  text: string | null;
  media: "photo" | "voice" | null;
}): string {
  const media =
    owner.media === "photo"
      ? "photo reçue"
      : owner.media === "voice"
        ? "message vocal reçu"
        : null;
  if (!owner.text)
    return media
      ? media.charAt(0).toUpperCase() + media.slice(1)
      : "Message reçu";
  return media ? `« ${owner.text} », ${media}` : `« ${owner.text} »`;
}

function summaryLine(summary: DashboardSummary): string {
  switch (summary.kind) {
    case "alert":
      return summary.owner ? ownerLine(summary.owner) : summary.reason;
    case "paused":
      return "Suivi en pause : aucune relance n'est envoyée";
    case "human_takeover":
      return "L'équipe a repris la conversation : Numa est en pause";
    case "consent_withdrawn":
      return "Le propriétaire a écrit STOP : plus aucun message ne part";
    case "consent_requested":
      return "Premier message envoyé, accord en attente";
    case "not_started":
      return "Premier message de Numa à venir";
    case "owner":
      return ownerLine(summary);
    default:
      return "Aucune nouvelle du propriétaire pour l'instant";
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

function toCard(followup: DashboardFollowup, now: Date): FollowupCardData {
  return {
    id: followup.id,
    animalName: followup.animalName,
    species: followup.species === "cat" ? "chat" : "chien",
    status: cardStatus(followup),
    summaryLine: summaryLine(followup.summary),
    procedure: followup.procedure,
    dayLabel: `J+${daysSince(followup.procedureAt, now)}`,
    vetName: shortPersonName(followup.responsibleName),
    lastActivity: followup.lastActivityAt
      ? formatRelativeMoment(followup.lastActivityAt, now)
      : "—",
  };
}

function toAgendaEvent(item: DashboardAgendaItem): AgendaEventData {
  return {
    id: item.id,
    time: formatTime(item.startsAt),
    duration: formatDuration(item.startsAt, item.endsAt),
    title: item.title,
    vetId: item.vetName,
    kind: item.kind,
    fromStivea: item.fromStivea,
    followupId: item.followupId ?? undefined,
  };
}

export default async function TodayPage() {
  const context = await memberContext();
  const can = (permission: PermissionKey) =>
    context.permissions.has(permission);
  const profile = await memberProfile(context);
  const now = new Date();
  // Suivis visibles selon les droits ; le détail clinique seulement avec l'accès clinique.
  const today = await services.today().today(context, now);
  const { views } = today;
  if (views.length === 0 && today.activeFollowups === 0)
    return (
      <>
        <PageHeader
          title={`Bonjour ${profile.firstName}`}
          description={profile.organizationName}
        />
        <Card>
          <EmptyState
            title="Aucun suivi pour l'instant"
            description={
              can("organization.settings")
                ? "Votre cabinet est créé. Le démarrage guidé vous accompagne : WhatsApp, dr.veto, urgences, équipe, protocoles et suivi test. Vos suivis apparaîtront ici."
                : "Vos suivis apparaîtront ici."
            }
            action={
              can("organization.settings") ? (
                <ButtonLink href="/app/demarrage">
                  Ouvrir le démarrage guidé
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
  const todayLabel = formatDayTitle(now);
  const agenda = today.agenda?.map(toAgendaEvent) ?? [];

  return (
    <>
      <PageHeader
        title={`Bonjour ${profile.firstName}`}
        description={
          clinical
            ? `${todayLabel} · ${plural(urgent.length, "urgence")} et ${plural(watch.length, "cas à surveiller", "cas à surveiller")}`
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
                Ouvrir un dossier
              </ButtonLink>
            ) : null}
            {can("followups.launch") ? (
              <ButtonLink
                href="/app/suivis/nouveau"
                icon={<PawPrint aria-hidden="true" className="size-4" />}
              >
                Lancer un suivi
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6">
        {urgent.map((followup) => {
          const card = toCard(followup, now);
          return (
            <AlertBanner
              key={followup.id}
              tone="urgent"
              title={
                followup.summary.kind === "alert"
                  ? `${followup.animalName} : urgence signalée à ${formatTime(followup.summary.at)}`
                  : `${followup.animalName} : urgence en cours`
              }
              action={
                <ButtonLink href={`/app/suivis/${followup.id}`} size="sm">
                  Ouvrir le dossier
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
                label="Urgences"
                value={urgent.length}
                tone="urgent"
                hint="À traiter maintenant"
              />
              <StatCard
                label="À surveiller"
                value={watch.length}
                tone="watch"
                hint="Signalés par Numa"
              />
            </>
          ) : null}
          <Card className="p-5">
            <p className="text-sm font-medium text-ink-muted">Suivis actifs</p>
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
            label="Rendez-vous Stivea"
            value={today.stiveaAppointments}
            hint="Aujourd'hui, confirmés par le cabinet"
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            {clinical ? (
              <>
                <SectionCard
                  title="Priorités"
                  description="Urgences et cas à surveiller, du plus grave au plus récent."
                >
                  {urgent.length + watch.length > 0 ? (
                    <ul className="-mx-3">
                      {[...urgent, ...watch].map((followup) => (
                        <li key={followup.id}>
                          <FollowupCard followup={toCard(followup, now)} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      title="Aucune priorité"
                      description="Tous les suivis évoluent normalement."
                    />
                  )}
                </SectionCard>

                <SectionCard
                  title="Autres suivis actifs"
                  action={
                    <ButtonLink href="/app/suivis" variant="quiet" size="sm">
                      Tous les suivis
                      <ArrowRight aria-hidden="true" className="size-4" />
                    </ButtonLink>
                  }
                >
                  <ul className="-mx-3">
                    {others.map((followup) => (
                      <li key={followup.id}>
                        <FollowupCard followup={toCard(followup, now)} />
                      </li>
                    ))}
                  </ul>
                  {others.length === 0 ? (
                    <EmptyState title="Aucun autre suivi actif" />
                  ) : null}
                </SectionCard>
              </>
            ) : (
              <SectionCard
                title="Suivis du cabinet"
                description="Vue d'organisation. Les données cliniques sont réservées aux personnes autorisées."
                action={
                  <ButtonLink href="/app/suivis" variant="quiet" size="sm">
                    Tous les suivis
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
                            {FOLLOWUP_STATUS_LABELS[view.status]}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="Aucun suivi à afficher" />
                )}
              </SectionCard>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            {today.agenda ? (
              <SectionCard
                title="Agenda du jour"
                description="Agenda dr.veto complet (simulé) ; rendez-vous Stivea identifiés."
                action={
                  <ButtonLink href="/app/agenda" variant="quiet" size="sm">
                    Agenda
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
                        />
                      </li>
                    ))}
                  </ol>
                ) : (
                  <EmptyState
                    title="Aucun rendez-vous aujourd'hui"
                    description="Connectez dr.veto dans les réglages pour voir l'agenda complet."
                  />
                )}
              </SectionCard>
            ) : null}

            <SectionCard title="Actions rapides">
              <div className="grid gap-2">
                {can("followups.launch") ? (
                  <ButtonLink
                    href="/app/suivis/nouveau"
                    variant="secondary"
                    className="justify-start"
                  >
                    <PawPrint aria-hidden="true" className="size-4" />
                    Lancer un suivi
                  </ButtonLink>
                ) : null}
                {views.length > 0 ? (
                  <ButtonLink
                    href="/app/suivis"
                    variant="secondary"
                    className="justify-start"
                  >
                    <FolderOpen aria-hidden="true" className="size-4" />
                    Ouvrir un dossier
                  </ButtonLink>
                ) : null}
                {can("owner_messages.reply") && visible[0] ? (
                  <ButtonLink
                    href={`/app/suivis/${urgent[0]?.id ?? visible[0].id}`}
                    variant="secondary"
                    className="justify-start"
                  >
                    <MessageSquareText aria-hidden="true" className="size-4" />
                    Écrire au propriétaire
                  </ButtonLink>
                ) : null}
              </div>
            </SectionCard>

            <AssistantCard assistant="numa">
              Suit {plural(today.activeFollowups, "animal", "animaux")} pour la
              clinique. Elle ne pose jamais de diagnostic et escalade en cas de
              doute.
            </AssistantCard>
            {can("stive.use") ? (
              <AssistantCard assistant="stive">
                Votre point du jour sera prêt ici. Toute action réelle attendra
                votre confirmation.
              </AssistantCard>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

function plural(
  count: number,
  singular: string,
  pluralForm = `${singular}s`,
): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}
