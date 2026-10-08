import { ArrowLeft, Eye } from "lucide-react";
import { redirect } from "next/navigation";

import {
  agendaToday,
  cabinet,
  followups,
  todayLabel,
  vetById,
} from "@/fixtures/cabinet-tilleuls";
import type { Followup } from "@/fixtures/types";
import { pathFor } from "@/i18n/routes";
import { fill } from "@/i18n/site";
import { readAuthCookie } from "@/server/auth/cookies";
import { services } from "@/server/services";
import { AgendaEvent } from "@/ui/agenda-event";
import { Card, SectionCard } from "@/ui/card";
import { ChatThread } from "@/ui/chat";
import { FollowupCard, fixtureCard } from "@/ui/followup-card";

import { CtaBand, PageIntro, Section, TextLink } from "../blocks";
import type { SiteProps } from "../chrome";
import { DemoForm, UnsubscribeForm } from "../forms";
import { PhoneDemo } from "../showcase";

export function DemoPage({
  locale,
  t,
  expired,
}: SiteProps & { expired: boolean }) {
  return (
    <>
      <PageIntro title={t.demo.title} lead={t.demo.lead} />
      <Section>
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_0.9fr]">
          <Card className="p-6 sm:p-8">
            <DemoForm locale={locale} copy={t.demo} expired={expired} />
          </Card>
          <div className="relative overflow-hidden rounded-[24px] bg-night px-6 py-10">
            <div aria-hidden="true" className="absolute inset-0 site-halos" />
            <div className="relative">
              <PhoneDemo t={t} />
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}

const vetName = (id: string) => vetById(id)?.shortName ?? "Vétérinaire";
const ORDER: Record<Followup["triage"], number> = {
  urgent: 0,
  watch: 1,
  normal: 2,
};

/**
 * Démo en lecture seule : uniquement les données fictives du cabinet des Tilleuls, sans session,
 * sans accès à la base des cabinets, sans aucune action. Ouverte après la demande de démo.
 */
export async function DemoSpacePage({
  locale,
  t,
  followupId,
}: SiteProps & { followupId: string | undefined }) {
  const access = await services.demo().access(await readAuthCookie("demo"));
  if (!access) redirect(`${pathFor("demo", locale)}?acces=expire`);

  const space = t.demo.space;
  const base = pathFor("demoSpace", locale);
  const hrefFor = (id: string) => `${base}?suivi=${id}`;
  const selected = followups.find((followup) => followup.id === followupId);

  return (
    <>
      <div className="border-b border-watch/30 bg-watch-soft px-4 py-3 text-sm text-watch">
        <p className="mx-auto flex max-w-6xl items-center gap-2 font-semibold">
          <Eye aria-hidden="true" className="size-4 shrink-0" />
          {space.banner}
        </p>
      </div>
      <PageIntro
        title={fill(space.welcome, { cabinet: access.cabinetName })}
        lead={space.intro}
      >
        {space.languageNote ? (
          <p className="mt-3 max-w-2xl text-sm text-ink-muted">
            {space.languageNote}
          </p>
        ) : null}
      </PageIntro>

      <Section className="py-10 sm:py-12">
        {selected ? (
          <DemoFollowup followup={selected} t={t} back={base} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <SectionCard
              title={space.prioritiesTitle}
              description={`${cabinet.name} · ${todayLabel} · ${space.prioritiesHint}`}
            >
              <ul className="-mx-3 grid">
                {[...followups]
                  .filter((followup) => followup.state !== "ended")
                  .sort((a, b) => ORDER[a.triage] - ORDER[b.triage])
                  .map((followup) => (
                    <li key={followup.id}>
                      <FollowupCard
                        followup={fixtureCard(
                          followup,
                          vetName(followup.responsibleVetId),
                        )}
                        href={hrefFor(followup.id)}
                      />
                    </li>
                  ))}
              </ul>
            </SectionCard>
            <SectionCard
              title={space.agendaTitle}
              description={space.agendaHint}
            >
              <ul className="grid gap-2">
                {agendaToday.map((event) => (
                  <li key={event.id}>
                    <AgendaEvent
                      event={event}
                      vetName={vetName(event.vetId)}
                      followupHref={hrefFor}
                    />
                  </li>
                ))}
              </ul>
            </SectionCard>
          </div>
        )}
      </Section>
      <CtaBand locale={locale} t={t} title={space.ctaTitle} />
    </>
  );
}

function DemoFollowup({
  followup,
  t,
  back,
}: {
  followup: Followup;
  t: SiteProps["t"];
  back: string;
}) {
  const space = t.demo.space;
  const synthesis = followup.synthesis;
  return (
    <div className="grid gap-4">
      <p>
        <TextLink href={back}>
          <ArrowLeft aria-hidden="true" className="inline size-4" />{" "}
          {space.back}
        </TextLink>
      </p>
      <h2 className="text-2xl font-bold">
        {followup.animal.name} · {followup.procedure}
      </h2>
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <SectionCard title={space.conversationTitle}>
          <ChatThread messages={followup.messages} />
        </SectionCard>
        {synthesis ? (
          <SectionCard
            title={space.synthesisTitle}
            description={synthesis.evolution}
          >
            <div className="grid gap-5 text-sm">
              {(
                [
                  [space.positives, synthesis.positives],
                  [space.negatives, synthesis.negatives],
                  [space.alerts, synthesis.alerts],
                  [space.questions, synthesis.openQuestions],
                ] as const
              )
                .filter(([, items]) => items.length > 0)
                .map(([title, items]) => (
                  <div key={title}>
                    <h3 className="font-semibold">{title}</h3>
                    <ul className="mt-2 grid list-disc gap-1 pl-5">
                      {items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}

export function UnsubscribePage({
  t,
  token,
}: SiteProps & { token: string | undefined }) {
  return (
    <>
      <PageIntro title={t.unsubscribe.title} lead={t.unsubscribe.body} />
      <Section className="pt-10 sm:pt-12">
        <Card className="max-w-xl p-6">
          <UnsubscribeForm token={token ?? ""} copy={t.unsubscribe} />
        </Card>
      </Section>
    </>
  );
}
