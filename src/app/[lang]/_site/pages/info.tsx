import { CircleDashed, LifeBuoy, ShieldAlert } from "lucide-react";

import {
  INCLUDED_ACTIVE_FOLLOWUPS,
  LAUNCH_SURCHARGE_CENTS,
  PLANS,
  PLAN_CATALOG,
  REACTIVATION_SURCHARGE_CENTS,
  TRIAL_MONTHLY_CENTS,
  TRIAL_MONTHS,
} from "@/domains/facturation/rules";
import { formatPrice } from "@/i18n/locales";
import { pathFor } from "@/i18n/routes";
import { fill } from "@/i18n/site";
import { Card } from "@/ui/card";

import {
  CheckList,
  CtaBand,
  LegalDraft,
  PageIntro,
  Section,
  SectionTitle,
  TextLink,
  TextSections,
} from "../blocks";
import { CtaLink, trialCta } from "../chrome";
import type { SiteProps } from "../chrome";

/** Prix issus du catalogue de facturation (une seule source, cahier des charges §13). */
export function PricingPage({ locale, t }: SiteProps) {
  const pricing = t.pricing;
  const price = (cents: number) => formatPrice(cents, locale);
  return (
    <>
      <PageIntro title={pricing.title} lead={pricing.lead} />
      <Section labelledBy="essai">
        <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-brand/30 bg-surface p-6 shadow-[var(--shadow-card)] sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div>
              <p className="w-fit rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-ink">
                {pricing.trial.badge}
              </p>
              <h2
                id="essai"
                className="mt-4 font-display text-3xl font-semibold"
              >
                {pricing.trial.name}
              </h2>
              <p className="mt-2 text-lg">
                {fill(pricing.trial.price, {
                  price: price(TRIAL_MONTHLY_CENTS),
                  months: TRIAL_MONTHS,
                })}
              </p>
              <CtaLink href={pathFor("trial", locale)} className="mt-6">
                {trialCta(locale, t)}
              </CtaLink>
            </div>
            <CheckList items={pricing.trial.points} />
          </div>
        </div>
      </Section>

      <Section labelledBy="formules" className="pt-0 sm:pt-0">
        <SectionTitle id="formules" title={pricing.plansTitle} />
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => {
            const copy = pricing.plans[plan];
            const definition = PLAN_CATALOG[plan];
            return (
              <li key={plan}>
                <Card className="flex h-full flex-col p-6">
                  <h3 className="text-lg font-bold">{copy.name}</h3>
                  <p className="text-sm text-ink-muted">{copy.vets}</p>
                  <p className="mt-5">
                    <span className="text-3xl font-bold tracking-tight">
                      {price(definition.annualMonthlyCents)}
                    </span>{" "}
                    <span className="text-sm text-ink-muted">
                      {pricing.perMonthExclVat}
                    </span>
                  </p>
                  <p className="text-sm text-ink-muted">{pricing.annual}</p>
                  <p className="mt-3 text-sm">
                    <span className="font-semibold">
                      {price(definition.monthlyCents)}
                    </span>{" "}
                    {pricing.perMonthExclVat} · {pricing.monthly}
                  </p>
                  <p className="mt-5 border-t border-line pt-4 text-sm">
                    {copy.stive}
                  </p>
                </Card>
              </li>
            );
          })}
        </ul>
        <Card className="mt-4 flex flex-wrap items-center justify-between gap-2 p-6">
          <h3 className="font-bold">{pricing.larger.name}</h3>
          <p className="text-ink-muted">{pricing.larger.body}</p>
        </Card>
      </Section>

      <Section labelledBy="usage" className="bg-surface">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <SectionTitle id="usage" title={pricing.usageTitle} />
            <CheckList
              className="mt-6"
              items={pricing.usage.map((line) =>
                fill(line, {
                  included: INCLUDED_ACTIVE_FOLLOWUPS,
                  launch: price(LAUNCH_SURCHARGE_CENTS),
                  reactivation: price(REACTIVATION_SURCHARGE_CENTS),
                }),
              )}
            />
          </div>
          <div>
            <h2 className="font-display text-[1.75rem] leading-tight font-semibold sm:text-4xl">
              {pricing.rulesTitle}
            </h2>
            <CheckList className="mt-6" items={pricing.rules} />
            <p className="mt-6 text-ink-muted">{pricing.noFree}</p>
          </div>
        </div>
      </Section>
      <div className="bg-surface">
        <CtaBand locale={locale} t={t} title={t.home.finalCta.title} />
      </div>
    </>
  );
}

export function SecurityPage({ locale, t }: SiteProps) {
  const security = t.security;
  return (
    <>
      <PageIntro title={security.title} lead={security.lead} />
      <Section>
        <TextSections sections={security.sections} />
        <Card className="mt-4 flex gap-4 p-6">
          <ShieldAlert
            aria-hidden="true"
            className="mt-0.5 size-6 shrink-0 text-brand"
          />
          <div>
            <h2 className="font-bold">{security.incidentsTitle}</h2>
            <p className="mt-2 text-ink-muted">{security.incidents}</p>
            <p className="mt-3">
              <TextLink href={pathFor("status", locale)}>
                {t.meta.status.title}
              </TextLink>
            </p>
          </div>
        </Card>
      </Section>
    </>
  );
}

export function HelpPage({ t }: SiteProps) {
  const help = t.help;
  return (
    <>
      <PageIntro title={help.title} lead={help.lead} />
      <Section>
        <ul className="grid gap-3 md:grid-cols-2">
          {help.topics.map((topic) => (
            <li key={topic}>
              <Card className="flex items-center justify-between gap-4 p-5">
                <span className="font-semibold">{topic}</span>
                <span className="shrink-0 rounded-full bg-canvas-subtle px-2.5 py-0.5 text-xs font-semibold text-ink-muted">
                  {help.soon}
                </span>
              </Card>
            </li>
          ))}
        </ul>
        <Card className="mt-4 flex gap-4 p-6">
          <LifeBuoy
            aria-hidden="true"
            className="mt-0.5 size-6 shrink-0 text-brand"
          />
          <div>
            <h2 className="font-bold">{help.supportTitle}</h2>
            <p className="mt-2 text-ink-muted">{help.support}</p>
          </div>
        </Card>
      </Section>
    </>
  );
}

/** Squelette : aucun état « opérationnel » n'est affiché tant que le service n'est pas ouvert. */
export function StatusPage({ t }: SiteProps) {
  const status = t.status;
  return (
    <>
      <PageIntro title={status.title} lead={status.lead} />
      <Section>
        <Card className="divide-y divide-line">
          {status.components.map((component) => (
            <div
              key={component}
              className="flex flex-wrap items-center justify-between gap-2 px-6 py-4"
            >
              <span className="font-semibold">{component}</span>
              <span className="inline-flex items-center gap-1.5 text-sm text-ink-muted">
                <CircleDashed aria-hidden="true" className="size-4" />
                {status.notOpen}
              </span>
            </div>
          ))}
        </Card>
        <p className="mt-6 text-ink-muted">{status.history}</p>
      </Section>
    </>
  );
}

export function TrialPage({ locale, t }: SiteProps) {
  const trial = t.trial;
  return (
    <>
      <PageIntro
        title={trial.title}
        lead={fill(trial.lead, {
          months: TRIAL_MONTHS,
          price: formatPrice(TRIAL_MONTHLY_CENTS, locale),
        })}
      >
        {t.common.appInFrench ? (
          <p className="mt-4 max-w-2xl text-sm text-ink-muted">
            {t.common.appInFrench}
          </p>
        ) : null}
      </PageIntro>
      <Section labelledBy="deroulement">
        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <Card className="p-6 sm:p-8">
            <h2 id="deroulement" className="text-xl font-bold">
              {trial.stepsTitle}
            </h2>
            <ol className="mt-6 grid gap-5">
              {trial.steps.map((step, index) => (
                <li key={step} className="flex gap-4">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand-ink">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <CtaLink href="/inscription">{trial.cta}</CtaLink>
              <TextLink href={pathFor("demo", locale)}>
                {trial.demoInstead}
              </TextLink>
            </div>
          </Card>
          <Card className="p-6 sm:p-8">
            <h2 className="text-xl font-bold">{trial.reassuranceTitle}</h2>
            <CheckList items={trial.reassurance} className="mt-6" />
            <p className="mt-6">
              <TextLink href={pathFor("pricing", locale)}>
                {t.nav.links.pricing}
              </TextLink>
            </p>
          </Card>
        </div>
      </Section>
    </>
  );
}

export function LegalPage({
  t,
  document,
}: SiteProps & { document: "terms" | "privacy" }) {
  const content = t[document];
  return (
    <>
      <PageIntro title={content.title}>
        <div className="mt-6 max-w-3xl">
          <LegalDraft t={t} />
        </div>
      </PageIntro>
      <Section>
        <TextSections sections={content.sections} />
      </Section>
    </>
  );
}
