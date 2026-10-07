import {
  ArrowRight,
  FolderOpen,
  MessageSquareText,
  PawPrint,
} from "lucide-react";
import type { Metadata } from "next";

import type { PermissionKey } from "@/domains/equipe/permissions";

import {
  agendaToday,
  cabinet,
  followups,
  todayLabel,
  vetById,
} from "@/fixtures/cabinet-tilleuls";
import { AgendaEvent } from "@/ui/agenda-event";
import { AlertBanner } from "@/ui/alert-banner";
import { AssistantCard } from "@/ui/assistant-card";
import { ButtonLink } from "@/ui/button";
import { CapacityMeter } from "@/ui/capacity-meter";
import { Card, SectionCard, StatCard } from "@/ui/card";
import { showsReferenceFixtures } from "@/fixtures/seed-ids";
import { memberProfile } from "@/server/auth/profile";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";
import { FollowupCard } from "@/ui/followup-card";
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";
import { StatusBadge } from "@/ui/status-badge";

import { FOLLOWUP_STATUS_LABELS } from "./suivis/followup-labels";

export const metadata: Metadata = { title: "Aujourd'hui" };

const vetName = (id: string) => vetById(id)?.shortName ?? "Vétérinaire";

export default async function TodayPage() {
  const context = await memberContext();
  const can = (permission: PermissionKey) =>
    context.permissions.has(permission);
  const profile = await memberProfile(context);
  if (!showsReferenceFixtures(context.organizationId))
    return (
      <>
        <PageHeader
          title={`Bonjour ${profile.firstName}`}
          description={profile.organizationName}
        />
        <Card>
          <EmptyState
            title="Aucun suivi pour l'instant"
            description="Votre cabinet est créé. L'installation guidée (WhatsApp, agenda, équipe, protocoles) arrive dans une prochaine étape ; vos suivis apparaîtront ici."
          />
        </Card>
      </>
    );

  // Les suivis affichés sont ceux que la base autorise pour cette personne ; les écrans
  // de référence n'en montrent le détail clinique qu'avec l'accès clinique.
  const views =
    can("followups.read_all") ||
    can("followups.read_own") ||
    can("followups.read_summary")
      ? await services.followups().list(context)
      : [];
  const clinicalIds = new Set(
    views.filter((view) => view.access === "clinical").map((view) => view.id),
  );
  const clinical = can("clinical.read");
  const visible = followups.filter((followup) => clinicalIds.has(followup.id));
  const urgent = visible.filter((followup) => followup.triage === "urgent");
  const watch = visible.filter((followup) => followup.triage === "watch");
  const others = visible.filter((followup) => followup.triage === "normal");
  // Nombre de suivis actifs du cabinet (capacité de l'offre) : un total, sans détail.
  const active = followups.filter((followup) => followup.state !== "ended");
  const stiveaAppointments = agendaToday.filter((event) => event.fromStivea);

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
        {urgent.map((followup) => (
          <AlertBanner
            key={followup.id}
            tone="urgent"
            title={`${followup.animal.name} : ${followup.summaryLine.toLowerCase()}`}
            action={
              <ButtonLink href={`/app/suivis/${followup.id}`} size="sm">
                Ouvrir le dossier
              </ButtonLink>
            }
          >
            {followup.procedure} · {followup.dayLabel} ·{" "}
            {vetName(followup.responsibleVetId)} · signalé à{" "}
            {followup.lastActivity}. Les consignes d&apos;urgence ont été
            envoyées au propriétaire.
          </AlertBanner>
        ))}

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
              {active.length} / {cabinet.includedActiveFollowups}
            </p>
            <div className="mt-2">
              <CapacityMeter
                used={active.length}
                included={cabinet.includedActiveFollowups}
              />
            </div>
          </Card>
          <StatCard
            label="Rendez-vous Stivea"
            value={stiveaAppointments.length}
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
                          <FollowupCard
                            followup={followup}
                            vetName={vetName(followup.responsibleVetId)}
                          />
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
                        <FollowupCard
                          followup={followup}
                          vetName={vetName(followup.responsibleVetId)}
                        />
                      </li>
                    ))}
                  </ul>
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
            {can("agenda.read") ? (
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
                <ol className="flex flex-col gap-2">
                  {agendaToday.map((event) => (
                    <li key={event.id}>
                      <AgendaEvent
                        event={event}
                        vetName={vetName(event.vetId)}
                      />
                    </li>
                  ))}
                </ol>
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
              Suit {plural(active.length, "animal", "animaux")} pour la
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
