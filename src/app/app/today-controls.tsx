import { ChevronDown } from "lucide-react";
import { Suspense } from "react";

import { daysSince } from "@/domains/suivis/calendrier";
import type { DashboardFollowup } from "@/domains/suivis/tableau";
import type { AppDictionary } from "@/i18n/app/types";
import type { Locale } from "@/i18n/locales";
import type { MemberContext } from "@/server/authz";
import { services } from "@/server/services";
import { AnimalAvatar } from "@/ui/animal-avatar";
import { ButtonLink } from "@/ui/button";
import { SectionCard } from "@/ui/card";
import { formatTime } from "@/ui/format";

import { CopySynthesisButton } from "./copy-synthesis";
import { alertLine, synthesisCopyText } from "./synthesis-copy";

/** Contrôles affichés : une matinée de consultations, pas tout l'agenda. */
export const MAX_CONTROLS = 8;

export type TodayControl = { followup: DashboardFollowup; at: Date };

/** La synthèse d'un contrôle, lue (ou rédigée sous garde-fous) au moment de l'affichage. */
async function ControlSynthesis({
  t,
  locale,
  context,
  control,
  now,
}: {
  t: AppDictionary;
  locale: Locale;
  context: MemberContext;
  control: TodayControl;
  now: Date;
}) {
  const { followup } = control;
  const text = t.dossier.synthesis;
  const synthesis = await services
    .synthesis()
    .forFollowup(context, followup.id, { now, language: locale });
  if (!synthesis) return <p className="text-sm text-ink-muted">{text.empty}</p>;
  const lists = [
    { title: text.negatives, items: synthesis.negatives },
    {
      title: text.alerts,
      items: synthesis.alerts.map((alert) => alertLine(t, locale, alert)),
    },
    { title: text.openQuestions, items: synthesis.openQuestions },
    { title: text.positives, items: synthesis.positives },
  ].filter((list) => list.items.length > 0);
  return (
    <div className="grid gap-3 text-sm">
      <p>{synthesis.evolution}</p>
      {lists.map((list) => (
        <div key={list.title}>
          <p className="font-semibold">{list.title}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-muted">
            {list.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
      {synthesis.withheld > 0 ? (
        <p className="text-ink-muted">{text.withheld(synthesis.withheld)}</p>
      ) : null}
      <CopySynthesisButton
        followupId={followup.id}
        animalName={followup.animalName}
        text={synthesisCopyText(t, locale, synthesis, {
          animalName: followup.animalName,
          procedure: followup.procedure,
          day: daysSince(followup.procedureAt, now),
        })}
      />
    </div>
  );
}

/**
 * « Contrôles du jour » (ADR 0048) : le matin du rendez-vous, la synthèse de chaque animal
 * est prête dans la vue d'ensemble, avec « Copier pour dr.veto ». Rien n'est écrit dans
 * dr.veto par Stivea Vet ; la synthèse reste celle du dossier, sous les mêmes garde-fous.
 */
export function TodayControls({
  t,
  locale,
  context,
  controls,
  now,
}: {
  t: AppDictionary;
  locale: Locale;
  context: MemberContext;
  controls: TodayControl[];
  now: Date;
}) {
  const text = t.dashboard.controls;
  return (
    <SectionCard
      id="controles-du-jour"
      title={text.title}
      description={text.description}
    >
      <ul aria-label={text.title} className="grid divide-y divide-line">
        {controls.map((control) => {
          const { followup } = control;
          return (
            <li
              key={followup.id}
              className="grid gap-3 py-4 first:pt-0 last:pb-0"
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <AnimalAvatar
                  name={followup.animalName}
                  species={followup.species}
                />
                <div className="min-w-0 flex-1 basis-48">
                  <p className="font-semibold">
                    {followup.animalName}
                    <span className="font-normal text-ink-muted">
                      {" "}
                      · {followup.procedure}
                    </span>
                  </p>
                  <p className="text-sm text-ink-muted">
                    {text.at(
                      formatTime(control.at, locale),
                      daysSince(followup.procedureAt, now),
                    )}
                  </p>
                </div>
                <ButtonLink
                  href={`/app/suivis/${followup.id}`}
                  variant="quiet"
                  size="sm"
                >
                  {t.dashboard.actions.openFile}
                  <span className="sr-only">
                    {t.dashboard.ready.forAnimal(followup.animalName)}
                  </span>
                </ButtonLink>
              </div>
              <details className="group rounded-[var(--radius-control)] border border-line bg-canvas/60 px-4 py-3">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                  {text.read}
                  <span className="sr-only">
                    {t.dashboard.ready.forAnimal(followup.animalName)}
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className="ml-auto size-4 text-ink-muted transition-transform group-open:rotate-180"
                  />
                </summary>
                <div className="mt-3">
                  <Suspense
                    fallback={
                      <p role="status" className="text-sm text-ink-muted">
                        {t.auth.pending}
                      </p>
                    }
                  >
                    <ControlSynthesis
                      t={t}
                      locale={locale}
                      context={context}
                      control={control}
                      now={now}
                    />
                  </Suspense>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
