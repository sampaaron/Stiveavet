import {
  ArrowRight,
  BellRing,
  Check,
  FolderOpen,
  Lock,
  Phone,
  Send,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { STARTING_PRICE_CENTS } from "@/domains/facturation/rules";
import { formatPrice } from "@/i18n/locales";
import { pathFor } from "@/i18n/routes";
import { fill } from "@/i18n/site";
import type { SiteDictionary } from "@/i18n/site";
import { cn } from "@/ui/cn";

import {
  AssistantPortrait,
  CheckList,
  CtaBand,
  Section,
  SectionTitle,
  TextLink,
} from "../blocks";
import { CtaLink, trialCta } from "../chrome";
import type { SiteProps } from "../chrome";
import { FaqTabs } from "../faq-tabs";
import { PresentationVideo } from "../presentation-video";
import { FloatingAlert, PhoneDemo } from "../showcase";

/*
 * Accueil construit sur la trame de limova.ai (demande d'Aaron du 19 octobre 2026) :
 * héros et demande à l'assistant, bandeau, vidéo, assistants, WhatsApp, preuves, intégrations,
 * étapes, aperçu du logiciel, questions par thème, engagements. Aucune note, aucun avis ni logo
 * de média inventés : leurs emplacements portent des faits vérifiables sur Stivea Vet.
 */

function CtaPair({ locale, t, className }: SiteProps & { className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      <CtaLink href={pathFor("trial", locale)} tone="mint">
        {trialCta(locale, t)}
      </CtaLink>
      <CtaLink href={pathFor("demo", locale)} tone="onDark">
        {t.common.ctaDemo}
      </CtaLink>
    </div>
  );
}

/** Demande à Stive, comme la barre « demande à l'agent » de Limova ; exemple fictif signalé. */
function StivePrompt({ t }: { t: SiteDictionary }) {
  const prompt = t.home.prompt;
  return (
    <figure
      aria-label={prompt.label}
      className="mx-auto w-full max-w-2xl rounded-[28px] bg-white/[0.06] p-3 text-left ring-1 ring-white/12 backdrop-blur-md sm:p-4"
    >
      <div className="flex items-center gap-3 rounded-full bg-white px-2 py-2 text-ink shadow-[0_18px_50px_-20px_rgb(0_0_0/0.8)]">
        <Image
          src="/assistants/stive.webp"
          alt=""
          width={36}
          height={36}
          className="shrink-0 rounded-full object-cover"
        />
        <p className="min-w-0 flex-1 truncate text-sm font-medium sm:text-base">
          {prompt.question}
        </p>
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-white"
        >
          <Send className="size-4" />
        </span>
      </div>
      <div className="mt-3 rounded-[20px] bg-night-soft/80 p-4 ring-1 ring-white/10 sm:p-5">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
          <Sparkles aria-hidden="true" className="size-4 text-mint" />
          {prompt.answerTitle}
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-mint">
            Stive · {t.common.stiveAi}
          </span>
        </p>
        <ul className="mt-3 grid gap-2 text-sm text-white/85">
          {prompt.answer.map((line, index) => (
            <li key={line} className="flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  index === 0
                    ? "bg-[#f0937f]"
                    : index === 1
                      ? "bg-[#e6b46a]"
                      : "bg-mint",
                )}
              />
              {line}
            </li>
          ))}
        </ul>
      </div>
      <figcaption className="mt-3 text-center text-xs text-white/65">
        {prompt.note}
      </figcaption>
    </figure>
  );
}

/** Bandeau défilant des protocoles fournis ; la seconde copie n'est que décorative. */
function ProtocolBand({ t }: { t: SiteDictionary }) {
  const band = t.home.band;
  const row = (hidden: boolean) => (
    <ul
      aria-hidden={hidden || undefined}
      className="flex shrink-0 items-center gap-3 pr-3 motion-reduce:shrink motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:pr-0"
    >
      {band.items.map((item) => (
        <li
          key={item}
          className="rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm whitespace-nowrap text-white/80"
        >
          {item}
        </li>
      ))}
    </ul>
  );
  return (
    <div className="relative mx-auto mt-16 max-w-6xl">
      <p className="text-center text-xs font-semibold tracking-[0.14em] text-white/60 uppercase">
        {band.title}
      </p>
      <div className="mt-5 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <div className="flex w-max animate-marquee motion-reduce:w-auto motion-reduce:animate-none motion-reduce:flex-wrap motion-reduce:justify-center">
          {row(false)}
          <div className="contents motion-reduce:hidden">{row(true)}</div>
        </div>
      </div>
    </div>
  );
}

function AssistantCard({
  assistant,
  locale,
  t,
}: SiteProps & { assistant: "numa" | "stive" }) {
  const copy = t.home.assistants;
  const card = copy[assistant];
  const name = assistant === "numa" ? "Numa" : "Stive";
  return (
    <article className="flex flex-col gap-5 rounded-[28px] border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
      <AssistantPortrait assistant={assistant} t={t} />
      <p className="font-semibold">{card.role}</p>
      <figure
        aria-label={fill(copy.chatLabel, { name })}
        className="grid gap-2 rounded-[20px] border border-line p-4 text-sm assistant-glow"
      >
        <p className="max-w-[85%] justify-self-end rounded-2xl rounded-tr-sm bg-brand px-3.5 py-2 text-white">
          {card.chat.ask}
        </p>
        <p className="max-w-[90%] rounded-2xl rounded-tl-sm bg-surface px-3.5 py-2 shadow-[var(--shadow-pill)]">
          <span className="mb-0.5 block text-[11px] font-semibold text-accent">
            {name} · {assistant === "numa" ? t.common.numaAi : t.common.stiveAi}
          </span>
          {card.chat.answer}
        </p>
      </figure>
      <p className="text-ink-muted">{card.body}</p>
      <CheckList items={card.points} />
      <p className="mt-auto pt-2">
        <TextLink href={pathFor(assistant, locale)}>
          {card.link}{" "}
          <ArrowRight aria-hidden="true" className="inline size-4" />
        </TextLink>
      </p>
    </article>
  );
}

const WHATSAPP_ICONS = [Phone, FolderOpen, BellRing] as const;

export function HomePage({ locale, t }: SiteProps) {
  const home = t.home;
  const price = formatPrice(STARTING_PRICE_CENTS, locale);
  return (
    <>
      {/* 1. Héros, demande à Stive et bandeau des protocoles. */}
      <section
        aria-labelledby="hero-title"
        className="relative overflow-hidden bg-night px-4 pb-16 text-white sm:pb-20"
      >
        <div aria-hidden="true" className="absolute inset-0 site-halos" />
        <div className="relative mx-auto max-w-6xl pt-14 text-center sm:pt-20">
          <Link
            href={pathFor("stive", locale)}
            className="mx-auto inline-flex max-w-full items-center gap-2 rounded-full border border-white/15 bg-white/5 py-1 pr-3 pl-1 text-xs font-semibold text-white/90 transition-colors hover:bg-white/10 sm:text-sm"
          >
            <span className="rounded-full bg-mint px-2 py-0.5 text-night">
              <Sparkles aria-hidden="true" className="inline size-3.5" />
            </span>
            <span className="truncate">{home.announce}</span>
            <ArrowRight aria-hidden="true" className="size-3.5 shrink-0" />
          </Link>
          <h1
            id="hero-title"
            className="mx-auto mt-7 max-w-4xl font-display text-[2.3rem] leading-[1.04] font-extrabold tracking-[-0.035em] text-balance sm:text-6xl lg:text-[4.4rem]"
          >
            {home.hero.title}{" "}
            <span className="bg-gradient-to-r from-mint to-[#d9f7e9] bg-clip-text text-transparent">
              {home.hero.titleAccent}
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-white/80 sm:text-lg">
            {home.hero.lead}
          </p>
          <div className="mt-10">
            <StivePrompt t={t} />
          </div>
          <CtaPair locale={locale} t={t} className="mt-10 justify-center" />
          <ul className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-white/80">
            {home.hero.points.map((point) => (
              <li key={point} className="flex items-center gap-2">
                <Check aria-hidden="true" className="size-4 text-mint" />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <ProtocolBand t={t} />

        {/* 2. Vidéo de présentation, au même endroit que celle de Limova. */}
        <div className="relative mx-auto mt-14 max-w-5xl">
          <PresentationVideo locale={locale} copy={home.video} />
        </div>
      </section>

      {/* 3. Les deux assistants IA. */}
      <Section labelledBy="assistants" className="bg-canvas">
        <SectionTitle
          id="assistants"
          eyebrow={home.assistants.eyebrow}
          title={home.assistants.title}
          lead={home.assistants.lead}
          centered
        />
        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          <AssistantCard assistant="numa" locale={locale} t={t} />
          <AssistantCard assistant="stive" locale={locale} t={t} />
        </div>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <CtaLink href={pathFor("trial", locale)}>
            {trialCta(locale, t)}
          </CtaLink>
          <CtaLink href={pathFor("demo", locale)} tone="outline">
            {t.common.ctaDemo}
          </CtaLink>
        </div>
      </Section>

      {/* 4. Numa sur WhatsApp, comme le « Charly+ » de Limova. */}
      <section
        aria-labelledby="whatsapp"
        className="relative overflow-hidden bg-night px-4 py-16 text-white sm:py-24"
      >
        <div aria-hidden="true" className="absolute inset-0 site-halos" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <SectionTitle
              id="whatsapp"
              eyebrow={home.whatsapp.eyebrow}
              title={home.whatsapp.title}
              lead={home.whatsapp.lead}
              onDark
            />
            <ul className="mt-9 grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {home.whatsapp.features.map((feature, index) => {
                const Icon = WHATSAPP_ICONS[index] ?? Check;
                return (
                  <li
                    key={feature.title}
                    className="rounded-[20px] bg-white/[0.05] p-5 ring-1 ring-white/10"
                  >
                    <Icon aria-hidden="true" className="size-5 text-mint" />
                    <p className="mt-3 font-semibold">{feature.title}</p>
                    <p className="mt-1 text-sm text-white/70">{feature.body}</p>
                  </li>
                );
              })}
            </ul>
            <div className="mt-9">
              <CtaPair locale={locale} t={t} />
            </div>
          </div>
          <div className="relative pb-6 lg:pb-0">
            <PhoneDemo t={t} />
            <div className="mt-6 flex justify-center lg:absolute lg:-bottom-8 lg:-left-6 lg:mt-0 lg:block">
              <FloatingAlert t={t} />
            </div>
          </div>
        </div>
      </section>

      {/* 5. Ce qui change, à la place des avis clients (aucun avis inventé). */}
      <Section labelledBy="avant-apres" className="bg-surface">
        <SectionTitle
          id="avant-apres"
          title={home.beforeAfter.title}
          lead={home.beforeAfter.lead}
          centered
        />
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <div className="rounded-[28px] border border-line bg-canvas-subtle p-6 sm:p-8">
            <h3 className="font-bold text-ink-muted">
              {home.beforeAfter.beforeTitle}
            </h3>
            <ul className="mt-5 grid gap-3 text-ink-muted">
              {home.beforeAfter.before.map((item) => (
                <li key={item} className="flex gap-3">
                  <span aria-hidden="true">·</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[28px] border border-brand/30 bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
            <h3 className="font-bold text-brand-ink">
              {home.beforeAfter.afterTitle}
            </h3>
            <CheckList items={home.beforeAfter.after} className="mt-5" />
          </div>
        </div>
      </Section>

      {/* 6. Intégrations. */}
      <Section labelledBy="integrations" className="bg-canvas">
        <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <SectionTitle
              id="integrations"
              title={home.integrations.title}
              lead={home.integrations.lead}
            />
            <p className="mt-6">
              <TextLink href={pathFor("integrations", locale)}>
                {home.integrations.link}{" "}
                <ArrowRight aria-hidden="true" className="inline size-4" />
              </TextLink>
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {t.integrations.items.map((item) => (
              <li
                key={item.name}
                className={cn(
                  "rounded-[20px] border p-5",
                  item.status === "launch"
                    ? "border-brand/30 bg-surface shadow-[var(--shadow-card)]"
                    : "border-line bg-canvas-subtle",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-lg font-bold">{item.name}</p>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      item.status === "launch"
                        ? "bg-brand-soft text-brand-ink"
                        : "bg-surface text-ink-muted ring-1 ring-line",
                    )}
                  >
                    {item.status === "launch"
                      ? t.common.atLaunch
                      : t.common.soon}
                  </span>
                </div>
                <p className="mt-2 text-sm text-ink-muted">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* 7. Les étapes d'un suivi. */}
      <Section labelledBy="etapes" className="bg-surface">
        <SectionTitle id="etapes" title={home.steps.title} centered />
        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {home.steps.items.map((step, index) => (
            <li
              key={step.title}
              className="relative rounded-[24px] border border-line bg-canvas p-6"
            >
              <span className="font-display text-4xl font-extrabold tracking-tight text-brand">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 font-bold">{step.title}</h3>
              <p className="mt-2 text-sm text-ink-muted">{step.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-8 text-center">
          <TextLink href={pathFor("how", locale)}>{home.steps.link}</TextLink>
        </p>
      </Section>

      {/* 8. Aperçu du logiciel. */}
      <section
        aria-labelledby="apercu"
        className="relative overflow-hidden bg-night px-4 pt-16 text-white sm:pt-24"
      >
        <div aria-hidden="true" className="absolute inset-0 site-halos" />
        <div className="relative mx-auto max-w-6xl">
          <SectionTitle
            id="apercu"
            eyebrow={home.preview.eyebrow}
            title={home.preview.title}
            lead={home.preview.lead}
            onDark
            centered
          />
          <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-white/80">
            {home.preview.points.map((point) => (
              <li key={point} className="flex items-center gap-2">
                <Check aria-hidden="true" className="size-4 text-mint" />
                {point}
              </li>
            ))}
          </ul>
          <figure className="mx-auto mt-12 max-w-5xl">
            <div className="overflow-hidden rounded-t-[22px] bg-night-soft p-2 pb-0 ring-1 ring-white/12">
              <div aria-hidden="true" className="flex gap-1.5 px-2 pt-1 pb-2.5">
                <span className="size-2.5 rounded-full bg-white/20" />
                <span className="size-2.5 rounded-full bg-white/20" />
                <span className="size-2.5 rounded-full bg-white/20" />
              </div>
              <Image
                src="/site/apercu-tableau-de-bord.webp"
                alt={home.preview.imageAlt}
                width={1440}
                height={900}
                sizes="(min-width: 1024px) 64rem, 100vw"
                className="w-full rounded-t-[14px]"
              />
            </div>
            <figcaption className="py-4 text-center text-xs text-white/65">
              {home.preview.caption}
            </figcaption>
          </figure>
        </div>
      </section>

      {/* 9. Questions par thème et aide. */}
      <Section labelledBy="faq" className="bg-surface">
        <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
          <div>
            <SectionTitle id="faq" title={home.faq.title} />
            <div className="mt-8">
              <FaqTabs
                label={home.faq.tabsLabel}
                tabs={home.faq.tabs.map((tab) => ({
                  label: tab.label,
                  items: tab.items.map((item) => ({
                    q: item.q,
                    a: fill(item.a, { price }),
                  })),
                }))}
              />
            </div>
          </div>
          <aside className="h-fit rounded-[28px] bg-night p-6 text-white sm:p-8 lg:mt-20">
            <h3 className="text-xl font-bold">{home.faq.helpTitle}</h3>
            <p className="mt-2 text-sm text-white/75">{home.faq.helpBody}</p>
            <div className="mt-6 grid gap-2">
              <CtaLink href={pathFor("demo", locale)} tone="mint">
                {t.common.ctaDemo}
              </CtaLink>
              <CtaLink href={pathFor("help", locale)} tone="onDark">
                {home.faq.helpLink}
              </CtaLink>
            </div>
          </aside>
        </div>
      </Section>

      {/* 10. Engagements et sécurité, à la place des logos de partenaires. */}
      <Section labelledBy="engagements" className="bg-canvas">
        <SectionTitle id="engagements" title={home.principles.title} centered />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {home.principles.items.map((item) => (
            <div
              key={item.title}
              className="rounded-[24px] border border-line bg-surface p-6"
            >
              <h3 className="font-bold">{item.title}</h3>
              <p className="mt-2 text-sm text-ink-muted">{item.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 rounded-[28px] border border-line bg-surface p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-brand-soft text-brand-ink">
              <Lock aria-hidden="true" className="size-5" />
            </span>
            <h3 className="text-lg font-bold">{home.securityTeaser.title}</h3>
          </div>
          <ul className="mt-5 flex flex-wrap gap-2">
            {home.securityTeaser.points.map((point) => (
              <li
                key={point}
                className="flex items-center gap-2 rounded-full bg-canvas-subtle px-3.5 py-1.5 text-sm"
              >
                <Check aria-hidden="true" className="size-3.5 text-brand" />
                {point}
              </li>
            ))}
          </ul>
          <p className="mt-5">
            <TextLink href={pathFor("security", locale)}>
              {home.securityTeaser.link}
            </TextLink>
          </p>
        </div>
      </Section>

      <div className="bg-canvas">
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
