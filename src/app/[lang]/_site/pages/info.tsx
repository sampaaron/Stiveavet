import { CircleDashed, ShieldAlert } from "lucide-react";

import {
  FEATURED_PLAN,
  LAUNCH_SURCHARGE_CENTS,
  PLANS,
  PLAN_CATALOG,
  REACTIVATION_SURCHARGE_CENTS,
  STARTING_PRICE_CENTS,
  introOfferOpen,
} from "@/domains/facturation/rules";
import type { PlanDefinition } from "@/domains/facturation/rules";
import { COOKIE_CATALOG } from "@/domains/consentement/cookies";
import { consentText } from "@/i18n/consent";
import { formatPrice } from "@/i18n/locales";
import { pathFor } from "@/i18n/routes";
import { fill } from "@/i18n/site";
import { currentConsent } from "@/server/consent";
import { Card } from "@/ui/card";
import { ConsentForm } from "@/ui/consent-form";
import { formatDate } from "@/ui/format";

import {
  CheckList,
  CtaBand,
  FaqList,
  LegalDraft,
  PageIntro,
  Section,
  SectionTitle,
  TextLink,
  TextSections,
} from "../blocks";
import { CtaLink, introOfferValues } from "../chrome";
import type { SiteProps } from "../chrome";
import { PricingVisual, SecurityVisual, SupportVisual } from "../illustrations";

/** Prix issus du catalogue de facturation (une seule source, cahier des charges §13). */
export function PricingPage({ locale, t }: SiteProps) {
  const pricing = t.pricing;
  const price = (cents: number) => formatPrice(cents, locale);
  const intro = introOfferOpen(new Date());
  const introValues = introOfferValues(locale);
  return (
    <>
      <PageIntro
        title={pricing.title}
        lead={pricing.lead}
        aside={<PricingVisual locale={locale} t={t} />}
      />
      <Section labelledBy="formules" theme="billing">
        <SectionTitle id="formules" title={pricing.plansTitle} />
        {intro ? (
          <Card className="mt-6 border-brand bg-brand-soft p-6">
            <h3 className="font-bold text-brand-ink">
              {fill(pricing.intro.title, introValues)}
            </h3>
            <p className="mt-1 text-sm text-ink-muted">
              {fill(pricing.intro.body, introValues)}
            </p>
          </Card>
        ) : null}
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
                  {intro ? (
                    <>
                      <p className="mt-5">
                        <s className="text-lg text-ink-muted">
                          <span className="sr-only">
                            {pricing.intro.regular}{" "}
                          </span>
                          <span>{price(definition.monthlyCents)}</span>
                        </s>{" "}
                        <span className="text-3xl font-bold tracking-tight">
                          {price(definition.introMonthlyCents)}
                        </span>{" "}
                        <span className="text-sm text-ink-muted">
                          {pricing.perMonthExclVat}
                        </span>
                      </p>
                      <p className="mt-1 text-sm text-ink-muted">
                        {fill(pricing.intro.then, {
                          ...introValues,
                          price: price(definition.monthlyCents),
                        })}
                      </p>
                    </>
                  ) : (
                    <p className="mt-5">
                      <span className="text-3xl font-bold tracking-tight">
                        {price(definition.monthlyCents)}
                      </span>{" "}
                      <span className="text-sm text-ink-muted">
                        {pricing.perMonthExclVat} · {pricing.monthly}
                      </span>
                    </p>
                  )}
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
                      {fill(t.common.ctaPlan, {
                        price: price(
                          intro
                            ? definition.introMonthlyCents
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
      <PageIntro
        title={security.title}
        lead={security.lead}
        aside={<SecurityVisual t={t} />}
      />
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

/** Questions fréquentes par thème ; l'assistance est présentée dans l'en-tête. */
export function HelpPage({ t }: SiteProps) {
  const help = t.help;
  return (
    <>
      <PageIntro
        title={help.title}
        lead={help.lead}
        aside={<SupportVisual t={t} />}
      />
      <Section theme="help">
        <div className="grid grid-cols-1 gap-x-10 gap-y-12 lg:grid-cols-2">
          {help.topics.map((topic, index) => (
            <section key={topic.title} aria-labelledby={`aide-${index}`}>
              <h2
                id={`aide-${index}`}
                className="font-display text-2xl font-semibold tracking-tight"
              >
                {topic.title}
              </h2>
              <FaqList items={topic.items} className="mt-4" />
            </section>
          ))}
        </div>
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
          price: formatPrice(STARTING_PRICE_CENTS, locale),
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

/** Politique de cookies (ADR 0053) : la liste réelle des cookies, et le choix modifiable. */
export async function CookiesPage({ locale }: SiteProps) {
  const text = consentText(locale);
  const consent = await currentConsent();
  return (
    <>
      <PageIntro title={text.policy.title} lead={text.policy.intro} />
      <Section theme="protocols">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
          <Card className="p-5 sm:p-6">
            <h2 className="text-lg font-bold tracking-tight">
              {text.policy.choiceTitle}
            </h2>
            <p className="mt-1 mb-4 text-sm text-ink-muted">
              {consent
                ? text.policy.current(formatDate(consent.givenAt, locale))
                : text.policy.none}
            </p>
            <ConsentForm
              locale={locale}
              current={consent}
              open
              idPrefix="politique"
            />
          </Card>
          <Card className="overflow-hidden">
            <h2
              id="liste-des-cookies"
              className="px-5 pt-5 text-lg font-bold tracking-tight sm:px-6 sm:pt-6"
            >
              {text.policy.listTitle}
            </h2>
            {/* Défilable au clavier sur petit écran. */}
            <div
              role="region"
              aria-labelledby="liste-des-cookies"
              tabIndex={0}
              className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-brand"
            >
              <table className="mt-3 w-full min-w-[34rem] text-left text-sm">
                <thead className="text-xs tracking-wide text-ink-muted uppercase">
                  <tr className="border-b border-line">
                    <th scope="col" className="px-5 py-2.5 font-medium sm:px-6">
                      {text.policy.columns.name}
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-medium">
                      {text.policy.columns.purpose}
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-medium sm:px-6">
                      {text.policy.columns.duration}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COOKIE_CATALOG.map((cookie) => (
                    <tr
                      key={cookie.name}
                      className="border-b border-line/60 last:border-0"
                    >
                      <th
                        scope="row"
                        className="px-5 py-3 font-mono text-[13px] font-semibold whitespace-nowrap sm:px-6"
                      >
                        {cookie.name}
                      </th>
                      <td className="px-3 py-3 text-ink-muted">
                        {text.policy.purposes[cookie.purpose]}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap sm:px-6">
                        {text.policy.durations[cookie.duration]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-5 pt-1 pb-5 text-xs text-ink-muted sm:px-6 sm:pb-6">
              {text.policy.secureNote}
            </p>
          </Card>
        </div>
      </Section>
    </>
  );
}
