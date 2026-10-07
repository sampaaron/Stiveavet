import { ArrowRight, Check, Lock } from "lucide-react";

import { TRIAL_MONTHLY_CENTS } from "@/domains/facturation/rules";
import { formatPrice } from "@/i18n/locales";
import { pathFor } from "@/i18n/routes";
import { fill } from "@/i18n/site";
import { Card } from "@/ui/card";

import {
  AssistantPortrait,
  CheckList,
  CtaBand,
  Faq,
  Section,
  SectionTitle,
  TextLink,
} from "../blocks";
import { CtaLink, trialCta } from "../chrome";
import type { SiteProps } from "../chrome";
import { FloatingAlert, PhoneDemo } from "../showcase";

export function HomePage({ locale, t }: SiteProps) {
  const home = t.home;
  const price = formatPrice(TRIAL_MONTHLY_CENTS, locale);
  return (
    <>
      <section
        aria-labelledby="hero-title"
        className="relative overflow-hidden bg-night px-4 text-white"
      >
        <div aria-hidden="true" className="absolute inset-0 site-halos" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 py-16 sm:py-20 lg:grid-cols-[1.15fr_0.85fr] lg:py-24">
          <div>
            <p className="w-fit rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold tracking-wide text-mint">
              {home.hero.eyebrow}
            </p>
            <h1
              id="hero-title"
              className="mt-6 font-display text-[2.15rem] leading-[1.08] font-semibold tracking-tight sm:text-5xl lg:text-[3.5rem]"
            >
              {home.hero.title}{" "}
              <span className="text-mint italic">{home.hero.titleAccent}</span>
            </h1>
            <p className="mt-6 max-w-xl text-base text-white/80 sm:text-lg">
              {home.hero.lead}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <CtaLink href={pathFor("trial", locale)}>
                {trialCta(locale, t)}
              </CtaLink>
              <CtaLink href={pathFor("demo", locale)} tone="onDark">
                {t.common.ctaDemo}
              </CtaLink>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/80">
              {home.hero.points.map((point) => (
                <li key={point} className="flex items-center gap-2">
                  <Check aria-hidden="true" className="size-4 text-mint" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative pb-6 lg:pb-0">
            <PhoneDemo t={t} />
            <div className="mt-6 flex justify-center lg:absolute lg:-bottom-10 lg:-left-28 lg:mt-0 lg:block">
              <FloatingAlert t={t} />
            </div>
          </div>
        </div>
      </section>

      <Section labelledBy="avant-apres">
        <SectionTitle
          id="avant-apres"
          title={home.beforeAfter.title}
          lead={home.beforeAfter.lead}
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-[var(--radius-card)] border border-line bg-canvas-subtle p-6">
            <h3 className="font-bold text-ink-muted">
              {home.beforeAfter.beforeTitle}
            </h3>
            <ul className="mt-4 grid gap-3 text-ink-muted">
              {home.beforeAfter.before.map((item) => (
                <li key={item} className="flex gap-3">
                  <span aria-hidden="true">·</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[var(--radius-card)] border border-brand/30 bg-surface p-6 shadow-[var(--shadow-card)]">
            <h3 className="font-bold text-brand-ink">
              {home.beforeAfter.afterTitle}
            </h3>
            <CheckList items={home.beforeAfter.after} className="mt-4" />
          </div>
        </div>
      </Section>

      <Section labelledBy="assistants" className="bg-surface">
        <SectionTitle
          id="assistants"
          title={home.assistants.title}
          lead={home.assistants.lead}
        />
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          {(["numa", "stive"] as const).map((assistant) => {
            const card = home.assistants[assistant];
            return (
              <Card key={assistant} className="flex flex-col gap-5 p-6 sm:p-8">
                <AssistantPortrait assistant={assistant} t={t} />
                <p className="font-semibold">{card.role}</p>
                <CheckList items={card.points} />
                <p className="mt-auto pt-2">
                  <TextLink href={pathFor(assistant, locale)}>
                    {card.link}{" "}
                    <ArrowRight aria-hidden="true" className="inline size-4" />
                  </TextLink>
                </p>
              </Card>
            );
          })}
        </div>
      </Section>

      <Section labelledBy="etapes">
        <SectionTitle id="etapes" title={home.steps.title} />
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {home.steps.items.map((step, index) => (
            <li key={step.title}>
              <Card className="h-full p-6">
                <span className="grid size-9 place-items-center rounded-full bg-brand-soft font-bold text-brand-ink">
                  {index + 1}
                </span>
                <h3 className="mt-4 font-bold">{step.title}</h3>
                <p className="mt-2 text-sm text-ink-muted">{step.body}</p>
              </Card>
            </li>
          ))}
        </ol>
        <p className="mt-6">
          <TextLink href={pathFor("how", locale)}>{home.steps.link}</TextLink>
        </p>
      </Section>

      <Section labelledBy="engagements" className="bg-surface">
        <SectionTitle id="engagements" title={home.principles.title} />
        <div className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-2">
          {home.principles.items.map((item) => (
            <div key={item.title} className="border-l-2 border-brand pl-5">
              <h3 className="font-bold">{item.title}</h3>
              <p className="mt-2 text-ink-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section labelledBy="securite">
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <div>
            <span className="grid size-11 place-items-center rounded-full bg-brand-soft text-brand-ink">
              <Lock aria-hidden="true" className="size-5" />
            </span>
            <SectionTitle
              id="securite"
              title={home.securityTeaser.title}
              className="mt-5"
            />
            <p className="mt-6">
              <TextLink href={pathFor("security", locale)}>
                {home.securityTeaser.link}
              </TextLink>
            </p>
          </div>
          <Card className="p-6 sm:p-8">
            <CheckList items={home.securityTeaser.points} />
          </Card>
        </div>
      </Section>

      <Section labelledBy="faq" className="bg-surface">
        <Faq
          id="faq"
          title={home.faq.title}
          items={home.faq.items.map((item) => ({
            q: item.q,
            a: fill(item.a, { price }),
          }))}
        />
      </Section>

      <div className="bg-surface">
        <CtaBand
          locale={locale}
          t={t}
          title={home.finalCta.title}
          body={fill(home.finalCta.body, { price })}
        />
      </div>
    </>
  );
}
