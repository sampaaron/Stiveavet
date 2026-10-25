import { CircleDashed, LifeBuoy, ShieldAlert } from "lucide-react";

import {
  FEATURED_PLAN,
  LAUNCH_OFFER,
  LAUNCH_SURCHARGE_CENTS,
  PLANS,
  PLAN_CATALOG,
  REACTIVATION_SURCHARGE_CENTS,
  launchOfferOpen,
  startingPriceCents,
} from "@/domains/facturation/rules";
import type { PlanDefinition } from "@/domains/facturation/rules";
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
  const launch = launchOfferOpen(new Date());
  return (
    <>
      <PageIntro title={pricing.title} lead={pricing.lead} />
      <Section labelledBy="formules" theme="billing">
        <SectionTitle id="formules" title={pricing.plansTitle} />
        <ul className="mt-8 grid gap-4 lg:grid-cols-3">
          {PLANS.map((plan) => {
            const copy = pricing.plans[plan];
            const definition = PLAN_CATALOG[plan];
            const featured = plan === FEATURED_PLAN;
            return (
              <li key={plan}>
                <Card
                  className={
                    featured
                      ? "flex h-full flex-col border-brand p-6 ring-1 ring-brand"
                      : "flex h-full flex-col p-6"
                  }
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-lg font-bold">{copy.name}</h3>
                    {featured ? (
                      <p className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-ink">
                        {pricing.featured}
                      </p>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">{copy.pitch}</p>
                  {launch ? (
                    <p className="mt-5 w-fit rounded-full bg-mint/10 px-3 py-1 text-xs font-bold text-mint ring-1 ring-mint/30">
                      {fill(pricing.launch.badge, {
                        percent: String(LAUNCH_OFFER.percentOff),
                      })}
                    </p>
                  ) : null}
                  <p className={launch ? "mt-3" : "mt-5"}>
                    <span className="text-3xl font-bold tracking-tight">
                      {price(
                        launch
                          ? definition.launchMonthlyCents
                          : definition.monthlyCents,
                      )}
                    </span>{" "}
                    <span className="text-sm text-ink-muted">
                      {pricing.perMonthExclVat} · {pricing.monthly}
                    </span>
                    {launch ? (
                      <span className="mt-1 block text-sm text-ink-muted">
                        <s aria-hidden="true">
                          {price(definition.monthlyCents)}
                        </s>{" "}
                        <span className="sr-only">
                          {fill(pricing.launch.instead, {
                            price: price(definition.monthlyCents),
                          })}
                        </span>
                      </span>
                    ) : null}
                  </p>
                  {launch ? (
                    <p className="mt-2 text-sm text-mint">
                      {fill(pricing.launch.terms, {
                        months: String(LAUNCH_OFFER.months),
                        price: price(definition.launchAnnualMonthlyCents),
                      })}
                    </p>
                  ) : null}
                  <p className="mt-1 text-sm text-ink-muted">
                    {fill(pricing.annual, {
                      price: price(definition.annualMonthlyCents),
                    })}
                  </p>
                  <CheckList
                    className="mt-5 border-t border-line pt-4"
                    items={planLines(pricing.quota, definition)}
                  />
                  <div className="mt-auto pt-6">
                    <CtaLink
                      href={pathFor("trial", locale)}
                      tone={featured ? "primary" : "outline"}
                      className="w-full"
                    >
                      {/* La formule d'entrée garde « dès » ; les autres affichent leur prix. */}
                      {plan === PLANS[0]
                        ? trialCta(locale, t)
                        : fill(t.common.ctaPlan, {
                            price: price(
                              launch
                                ? definition.launchMonthlyCents
                                : definition.monthlyCents,
                            ),
                          })}
                    </CtaLink>
                  </div>
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

      <Section labelledBy="usage" tinted theme="billing">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <SectionTitle id="usage" title={pricing.usageTitle} />
            <CheckList
              className="mt-6"
              items={pricing.usage.map((line) =>
                fill(line, {
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
      <CtaBand locale={locale} t={t} title={t.home.finalCta.title} />
    </>
  );
}

/** Ce que comprend une formule, tiré du catalogue (une seule source). */
function planLines(
  quota: SiteProps["t"]["pricing"]["quota"],
  plan: PlanDefinition,
): string[] {
  const count = (one: string, many: string, value: number) =>
    value === 1 ? one : fill(many, { count: value });
  return [
    count(quota.vet, quota.vets, plan.maxVets),
    plan.maxAssistants === null
      ? quota.assistantsUnlimited
      : count(quota.assistant, quota.assistants, plan.maxAssistants),
    fill(quota.followups, {
      included: plan.includedActiveFollowups,
      max: plan.maxActiveFollowups,
    }),
    plan.stive ? quota.stive : quota.noStive,
    ...(plan.advancedIntegrations ? [quota.integrations] : []),
  ];
}

export function SecurityPage({ locale, t }: SiteProps) {
  const security = t.security;
  return (
    <>
      <PageIntro title={security.title} lead={security.lead} />
      <Section theme="team">
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
      <Section theme="help">
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
      <Section theme="journal">
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
          price: formatPrice(startingPriceCents(new Date()), locale),
        })}
      />
      <Section labelledBy="deroulement" theme="onboarding">
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
      <Section theme="protocols">
        <TextSections sections={content.sections} />
      </Section>
    </>
  );
}
