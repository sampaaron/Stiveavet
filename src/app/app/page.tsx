import {
  ArrowRight,
  FolderOpen,
  MessageSquareText,
  PawPrint,
} from "lucide-react";
import type { Metadata } from "next";

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
import { requireSession } from "@/server/auth";
import { memberProfile } from "@/server/auth/profile";
import { FollowupCard } from "@/ui/followup-card";
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";

export const metadata: Metadata = { title: "Aujourd'hui" };

const vetName = (id: string) => vetById(id)?.shortName ?? "Vétérinaire";

export default async function TodayPage() {
  const session = await requireSession();
  const profile = await memberProfile(session);
  if (!showsReferenceFixtures(session.organizationId))
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

  const urgent = followups.filter((followup) => followup.triage === "urgent");
  const watch = followups.filter((followup) => followup.triage === "watch");
  const others = followups.filter((followup) => followup.triage === "normal");
  const active = followups.filter((followup) => followup.state !== "ended");
  const stiveaAppointments = agendaToday.filter((event) => event.fromStivea);

  return (
    <>
      <PageHeader
        title={`Bonjour ${profile.firstName}`}
        description={`${todayLabel} · ${plural(urgent.length, "urgence")} et ${plural(watch.length, "cas à surveiller", "cas à surveiller")}`}
        actions={
          <>
            <ButtonLink
              href="/app/suivis"
              variant="secondary"
              icon={<FolderOpen aria-hidden="true" className="size-4" />}
            >
              Ouvrir un dossier
            </ButtonLink>
            <ButtonLink
              href="/app/suivis/nouveau"
              icon={<PawPrint aria-hidden="true" className="size-4" />}
            >
              Lancer un suivi
            </ButtonLink>
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
          </div>

          <div className="flex min-w-0 flex-col gap-6">
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
                    <AgendaEvent event={event} vetName={vetName(event.vetId)} />
                  </li>
                ))}
              </ol>
            </SectionCard>

            <SectionCard title="Actions rapides">
              <div className="grid gap-2">
                <ButtonLink
                  href="/app/suivis/nouveau"
                  variant="secondary"
                  className="justify-start"
                >
                  <PawPrint aria-hidden="true" className="size-4" />
                  Lancer un suivi
                </ButtonLink>
                <ButtonLink
                  href="/app/suivis"
                  variant="secondary"
                  className="justify-start"
                >
                  <FolderOpen aria-hidden="true" className="size-4" />
                  Ouvrir un dossier
                </ButtonLink>
                <ButtonLink
                  href={`/app/suivis/${urgent[0]?.id ?? followups[0]?.id ?? ""}`}
                  variant="secondary"
                  className="justify-start"
                >
                  <MessageSquareText aria-hidden="true" className="size-4" />
                  Écrire au propriétaire
                </ButtonLink>
              </div>
            </SectionCard>

            <AssistantCard assistant="numa">
              Suit {plural(active.length, "animal", "animaux")} pour la
              clinique. Elle ne pose jamais de diagnostic et escalade en cas de
              doute.
            </AssistantCard>
            <AssistantCard assistant="stive">
              Votre point du jour sera prêt ici. Toute action réelle attendra
              votre confirmation.
            </AssistantCard>
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
