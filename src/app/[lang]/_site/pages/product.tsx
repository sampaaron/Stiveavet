import { Clock, Hourglass, Plug } from "lucide-react";

import { pathFor } from "@/i18n/routes";
import { Card } from "@/ui/card";
import { StatusBadge } from "@/ui/status-badge";
import type { Status } from "@/ui/status-badge";

import {
  AssistantPortrait,
  CheckList,
  CtaBand,
  PageIntro,
  Section,
  SectionTitle,
  TextLink,
} from "../blocks";
import type { SiteProps } from "../chrome";

const TRIAGE: Record<string, Status> = {
  normal: "normal",
  watch: "watch",
  urgent: "urgent",
};

export function HowPage({ locale, t }: SiteProps) {
  const how = t.how;
  return (
    <>
      <PageIntro title={how.title} lead={how.lead} />
      <Section labelledBy="parcours">
        <SectionTitle id="parcours" title={how.journeyTitle} />
        <ol className="mt-10 grid gap-4">
          {how.journey.map((step, index) => (
            <li key={step.title}>
              <Card className="flex gap-5 p-6">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft font-bold text-brand-ink">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-bold">{step.title}</h3>
                  <p className="mt-1.5 text-ink-muted">{step.body}</p>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      </Section>

      <Section labelledBy="triage" className="bg-surface">
        <SectionTitle id="triage" title={how.triageTitle} />
        <div className="mt-10 grid gap-3 md:hidden">
          {how.triage.map((row) => (
            <Card key={row.level} className="p-5">
              <StatusBadge
                status={TRIAGE[row.level] ?? "normal"}
                label={row.name}
              />
              <p className="mt-3 text-sm">{row.where}</p>
              <p className="mt-1 text-sm text-ink-muted">{row.notify}</p>
            </Card>
          ))}
        </div>
        <table className="mt-10 hidden w-full border-separate border-spacing-0 overflow-hidden rounded-[var(--radius-card)] border border-line text-left md:table">
          <thead className="bg-canvas-subtle text-sm">
            <tr>
              <th scope="col" className="px-5 py-3 font-semibold">
                {how.triageHeaders.level}
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                {how.triageHeaders.where}
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                {how.triageHeaders.notify}
              </th>
            </tr>
          </thead>
          <tbody>
            {how.triage.map((row) => (
              <tr key={row.level}>
                <th
                  scope="row"
                  className="border-t border-line px-5 py-4 font-normal"
                >
                  <StatusBadge
                    status={TRIAGE[row.level] ?? "normal"}
                    label={row.name}
                  />
                </th>
                <td className="border-t border-line px-5 py-4">{row.where}</td>
                <td className="border-t border-line px-5 py-4 text-ink-muted">
                  {row.notify}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-6 max-w-3xl text-ink-muted">{how.triageNote}</p>
      </Section>

      <Section labelledBy="controle">
        <SectionTitle id="controle" title={how.controlTitle} />
        <CheckList items={how.control} className="mt-8 max-w-3xl" />
      </Section>
      <CtaBand locale={locale} t={t} title={t.home.finalCta.title} />
    </>
  );
}

export function NumaPage({ locale, t }: SiteProps) {
  const numa = t.numa;
  return (
    <>
      <PageIntro title={numa.title} lead={numa.lead}>
        <div className="mt-8">
          <AssistantPortrait assistant="numa" t={t} size={88} />
        </div>
      </PageIntro>
      <Section labelledBy="numa-fait">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-6 sm:p-8">
            <h2 id="numa-fait" className="text-xl font-bold">
              {numa.doesTitle}
            </h2>
            <CheckList items={numa.does} className="mt-6" />
          </Card>
          <Card className="p-6 sm:p-8">
            <h2 className="text-xl font-bold">{numa.neverTitle}</h2>
            <CheckList items={numa.never} tone="never" className="mt-6" />
          </Card>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card className="p-6">
            <h2 className="font-bold">{numa.consentTitle}</h2>
            <p className="mt-2 text-ink-muted">{numa.consent}</p>
          </Card>
          <Card className="p-6">
            <h2 className="font-bold">{numa.photoTitle}</h2>
            <p className="mt-2 text-ink-muted">{numa.photo}</p>
          </Card>
        </div>
        <p className="mt-6">
          <TextLink href={pathFor("how", locale)}>{t.home.steps.link}</TextLink>
        </p>
      </Section>
      <CtaBand locale={locale} t={t} title={t.home.finalCta.title} />
    </>
  );
}

export function StivePage({ locale, t }: SiteProps) {
  const stive = t.stive;
  return (
    <>
      <PageIntro title={stive.title} lead={stive.lead}>
        <div className="mt-8">
          <AssistantPortrait assistant="stive" t={t} size={88} />
        </div>
      </PageIntro>
      <Section labelledBy="stive-prepare">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <Card className="p-6 sm:p-8">
            <h2 id="stive-prepare" className="text-xl font-bold">
              {stive.canTitle}
            </h2>
            <CheckList items={stive.can} className="mt-6" />
          </Card>
          <div className="rounded-[var(--radius-card)] border border-brand/30 bg-brand-soft/50 p-6 sm:p-8">
            <h2 className="text-xl font-bold">{stive.ruleTitle}</h2>
            <p className="mt-3 text-lg">{stive.rule}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card className="p-6">
            <h2 className="font-bold">{stive.accessTitle}</h2>
            <p className="mt-2 text-ink-muted">{stive.access}</p>
          </Card>
          <Card className="p-6">
            <h2 className="font-bold">{stive.limitTitle}</h2>
            <p className="mt-2 text-ink-muted">{stive.limit}</p>
          </Card>
        </div>
      </Section>
      <CtaBand locale={locale} t={t} title={t.home.finalCta.title} />
    </>
  );
}

export function IntegrationsPage({ locale, t }: SiteProps) {
  const integrations = t.integrations;
  return (
    <>
      <PageIntro title={integrations.title} lead={integrations.lead} />
      <Section>
        <ul className="grid gap-4 md:grid-cols-2">
          {integrations.items.map((item) => {
            const launch = item.status === "launch";
            return (
              <li key={item.name}>
                <Card className="h-full p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="flex items-center gap-2.5 text-lg font-bold">
                      <Plug
                        aria-hidden="true"
                        className="size-5 text-ink-muted"
                      />
                      {item.name}
                    </h2>
                    <span
                      className={
                        launch
                          ? "inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-0.5 text-[13px] font-semibold text-brand-ink"
                          : "inline-flex items-center gap-1.5 rounded-full bg-canvas-subtle px-2.5 py-0.5 text-[13px] font-semibold text-ink-muted"
                      }
                    >
                      {launch ? (
                        <Clock aria-hidden="true" className="size-3.5" />
                      ) : (
                        <Hourglass aria-hidden="true" className="size-3.5" />
                      )}
                      {launch ? t.common.atLaunch : t.common.soon}
                    </span>
                  </div>
                  <p className="mt-3 text-ink-muted">{item.body}</p>
                </Card>
              </li>
            );
          })}
        </ul>
        <Card className="mt-4 p-6 sm:p-8">
          <h2 className="text-lg font-bold">{integrations.screenshotTitle}</h2>
          <p className="mt-2 max-w-3xl text-ink-muted">
            {integrations.screenshot}
          </p>
        </Card>
      </Section>
      <CtaBand locale={locale} t={t} title={t.home.finalCta.title} />
    </>
  );
}
