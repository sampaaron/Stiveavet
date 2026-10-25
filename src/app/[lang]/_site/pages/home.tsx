import {
  ArrowRight,
  CalendarDays,
  Check,
  Lock,
  MessageCircle,
  Stethoscope,
  X,
} from "lucide-react";
import Image from "next/image";
import { ViewTransition } from "react";

import { startingPriceCents } from "@/domains/facturation/rules";
import { formatPrice } from "@/i18n/locales";
import { pathFor } from "@/i18n/routes";
import { fill } from "@/i18n/site";
import type { SiteDictionary } from "@/i18n/site";
import { cn } from "@/ui/cn";

import {
  Badge,
  CheckList,
  CtaBand,
  Faq,
  Section,
  SectionTitle,
  TextLink,
} from "../blocks";
import { CtaLink, trialCta } from "../chrome";
import type { SiteProps } from "../chrome";
import { AssistantTabs, FilmPlayer, StepsAccordion } from "../interactive";
import { AppPreview, PhoneDemo } from "../showcase";

/**
 * Accueil du site, sur la trame de Limova (ADR 0034) : bandeau, héros centré avec la question
 * à Numa, film juste dessous, assistants en onglets, WhatsApp, quotidien, intégrations,
 * démarrage en étapes, questions fréquentes et appel final.
 */
export function HomePage({ locale, t }: SiteProps) {
  const home = t.home;
  const price = formatPrice(startingPriceCents(new Date()), locale);
  const ctas = (
    <div className="flex flex-wrap justify-center gap-3">
      <CtaLink href={pathFor("trial", locale)}>{trialCta(locale, t)}</CtaLink>
      <CtaLink href={pathFor("demo", locale)} tone="onDark">
        {t.common.ctaDemo}
      </CtaLink>
    </div>
  );

  return (
    <>
      <section
        aria-labelledby="hero-title"
        className="relative px-4 pt-14 sm:pt-20"
      >
        {/* L'horizon vert déborde sous la section des assistants et s'y efface (pas de bord). */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -bottom-80 -z-10 fade-out-bottom [--fade-length:24rem] [--glow-bleed:20rem] hero-glow"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_50%_30%,black,transparent_70%)] [background-size:24px_24px]"
        />
        <div className="mx-auto max-w-5xl text-center">
          <p className="mx-auto flex w-fit items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold tracking-wide text-mint backdrop-blur">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-mint shadow-[0_0_10px_#8ce8c3]"
            />
            {home.hero.eyebrow}
          </p>
          {/* Même nom que le titre des pages intérieures : il glisse d'une page à l'autre. */}
          <ViewTransition
            name="site-title"
            share="site-title-morph"
            default="none"
          >
            <h1
              id="hero-title"
              className="mx-auto mt-7 max-w-4xl text-[2.35rem] leading-[1.04] font-extrabold tracking-[-0.035em] text-balance sm:text-6xl lg:text-[4.25rem]"
            >
              {home.hero.title}{" "}
              <Image
                src="/assistants/numa.webp"
                alt=""
                width={72}
                height={72}
                priority
                className="inline-block size-[0.85em] rounded-full object-cover align-[-0.1em] ring-2 ring-mint/50"
              />{" "}
              <span className="text-gradient-mint">
                {home.hero.titleAccent}
              </span>
            </h1>
          </ViewTransition>
          <p className="mx-auto mt-6 max-w-2xl text-base text-ink-muted sm:text-lg">
            {home.hero.lead}
          </p>

          <div className="mx-auto mt-10 max-w-2xl rounded-[28px] border border-white/10 bg-white/[0.04] p-2.5 text-left shadow-[0_30px_80px_-40px_rgb(140_232_195/0.45)] backdrop-blur-xl">
            <figure
              aria-label={home.ask.label}
              className="flex items-center gap-3 rounded-[20px] bg-black/25 px-4 py-4"
            >
              <Image
                src="/assistants/numa.webp"
                alt=""
                width={36}
                height={36}
                className="size-9 shrink-0 rounded-full object-cover"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-ink sm:text-base">
                  {home.ask.prompt}
                  <span
                    aria-hidden="true"
                    className="ml-0.5 inline-block h-[1.1em] w-0.5 translate-y-[0.2em] bg-mint motion-safe:animate-pulse"
                  />
                </span>
                <span className="mt-0.5 block text-xs text-ink-muted">
                  {home.ask.who}
                </span>
              </span>
            </figure>
            <div className="flex flex-wrap items-center justify-end gap-2 px-1.5 pt-2.5 pb-1">
              <CtaLink href={pathFor("demo", locale)} tone="onDark">
                {t.common.ctaDemo}
              </CtaLink>
              <CtaLink href={pathFor("trial", locale)}>
                {trialCta(locale, t)}
                <ArrowRight aria-hidden="true" className="ml-1.5 size-4" />
              </CtaLink>
            </div>
          </div>

          <ul className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-ink-muted">
            {home.hero.points.map((point) => (
              <li key={point} className="flex items-center gap-2">
                <Check aria-hidden="true" className="size-4 text-mint" />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="mx-auto mt-14 max-w-6xl pb-10 sm:mt-16">
          <FilmPlayer
            src="/video/stivea-vet-film.mp4"
            poster="/video/stivea-vet-film-poster.jpg"
            label={home.film.label}
            soundOn={home.film.soundOn}
            soundOff={home.film.soundOff}
            playLabel={home.film.play}
            pauseLabel={home.film.pause}
          />
        </div>
      </section>

      <Section labelledBy="assistants" theme="assistants">
        <div className="text-center">
          <Badge>{home.badges.assistants}</Badge>
          <SectionTitle
            id="assistants"
            title={home.assistants.title}
            lead={home.assistants.lead}
            center
            className="mt-5"
          />
          <div className="mt-8">{ctas}</div>
        </div>
        <div className="mt-12">
          <AssistantTabs
            label={home.assistants.title}
            tabs={(["numa", "stive"] as const).map((key) => ({
              key,
              name: key === "numa" ? "Numa" : "Stive",
              ai: key === "numa" ? t.common.numaAi : t.common.stiveAi,
              role: home.assistants[key].role,
              points: home.assistants[key].points,
              link: (
                <TextLink href={pathFor(key, locale)}>
                  {home.assistants[key].link}{" "}
                  <ArrowRight aria-hidden="true" className="inline size-4" />
                </TextLink>
              ),
              demo: key === "numa" ? <ChatDemo t={t} /> : <AppPreview t={t} />,
            }))}
          />
        </div>
      </Section>

      <Section labelledBy="whatsapp" theme="followups">
        <div className="grid items-center gap-14 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="order-2 lg:order-1">
            <PhoneDemo t={t} />
          </div>
          <div className="order-1 lg:order-2">
            <Badge>{home.badges.whatsapp}</Badge>
            <SectionTitle
              id="whatsapp"
              title={home.whatsapp.title}
              lead={home.whatsapp.lead}
              className="mt-5"
            />
            <CheckList items={home.beforeAfter.after} className="mt-8" />
            <div className="mt-9 flex flex-wrap gap-3">
              <CtaLink href={pathFor("trial", locale)}>
                {trialCta(locale, t)}
              </CtaLink>
              <CtaLink href={pathFor("demo", locale)} tone="onDark">
                {t.common.ctaDemo}
              </CtaLink>
            </div>
          </div>
        </div>
      </Section>

      <Section labelledBy="avant-apres" theme="protocols">
        <div className="text-center">
          <Badge>{home.badges.change}</Badge>
          <SectionTitle
            id="avant-apres"
            title={home.beforeAfter.title}
            lead={home.beforeAfter.lead}
            center
            className="mt-5"
          />
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          <div className="rounded-[28px] border border-line/80 bg-white/[0.02] p-7">
            <h3 className="font-bold text-ink-muted">
              {home.beforeAfter.beforeTitle}
            </h3>
            <ul className="mt-5 grid gap-3 text-ink-muted">
              {home.beforeAfter.before.map((item) => (
                <li key={item} className="flex gap-3">
                  <X
                    aria-hidden="true"
                    className="mt-1 size-4 shrink-0 text-urgent/80"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative overflow-hidden rounded-[28px] border border-mint/25 bg-mint/[0.05] p-7 shadow-[0_30px_80px_-40px_rgb(140_232_195/0.5)]">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-[conic-gradient(from_200deg,#8ce8c3,#5b4fe0,#f5c46b,#8ce8c3)] opacity-20 blur-3xl"
            />
            <h3 className="font-bold text-mint">
              {home.beforeAfter.afterTitle}
            </h3>
            <CheckList items={home.beforeAfter.after} className="mt-5" />
          </div>
        </div>
        <h3 className="mt-14 text-center text-xl font-bold tracking-tight">
          {home.principles.title}
        </h3>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {home.principles.items.map((item) => (
            <div
              key={item.title}
              className="rounded-[24px] border border-line/80 bg-white/[0.02] p-6 transition-colors hover:border-mint/30"
            >
              <h3 className="font-bold">{item.title}</h3>
              <p className="mt-2 text-sm text-ink-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section labelledBy="integrations" theme="team">
        <Integrations t={t} locale={locale} />
      </Section>

      <Section labelledBy="etapes" theme="onboarding">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <Badge>{home.badges.steps}</Badge>
            <SectionTitle
              id="etapes"
              title={home.steps.title}
              className="mt-5"
            />
            <div className="mt-8">
              <StepsAccordion steps={home.steps.items} />
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <CtaLink href={pathFor("trial", locale)}>
                {trialCta(locale, t)}
              </CtaLink>
              <CtaLink href={pathFor("how", locale)} tone="onDark">
                {home.steps.link}
              </CtaLink>
            </div>
          </div>
          <AppPreview t={t} />
        </div>
      </Section>

      <Section labelledBy="securite">
        <div className="grid items-center gap-10 rounded-[32px] border border-line/80 bg-white/[0.02] p-7 sm:p-10 lg:grid-cols-2">
          <div>
            <span className="grid size-12 place-items-center rounded-2xl bg-mint/10 text-mint ring-1 ring-mint/25">
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
          <CheckList items={home.securityTeaser.points} />
        </div>
      </Section>

      <Section labelledBy="faq" theme="help">
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <Badge>{home.badges.faq}</Badge>
          </div>
          <Faq
            id="faq"
            title={home.faq.title}
            center
            items={home.faq.items.map((item) => ({
              q: item.q,
              a: fill(item.a, { price }),
            }))}
          />
        </div>
      </Section>

      <CtaBand
        locale={locale}
        t={t}
        title={home.finalCta.title}
        body={fill(home.finalCta.body, { price })}
      />
    </>
  );
}

/** Conversation fictive avec Numa, en bulles sombres, dans l'onglet de Numa. */
function ChatDemo({ t }: { t: SiteDictionary }) {
  const phone = t.home.phone;
  return (
    <figure aria-label={phone.label} className="flex h-full flex-col gap-3">
      <ol className="flex flex-1 flex-col justify-center gap-3 text-[15px] leading-snug">
        {phone.messages.map((message, index) => (
          <li
            key={index}
            className={cn(
              "max-w-[85%] rounded-2xl px-4 py-3",
              message.from === "numa"
                ? "self-start rounded-tl-md border border-white/10 bg-white/[0.06]"
                : "self-end rounded-tr-md bg-mint/15 text-ink",
            )}
          >
            {message.from === "numa" && index === 0 ? (
              <span className="mb-1 block text-xs font-semibold text-mint">
                Numa · {t.common.numaAi}
              </span>
            ) : null}
            {message.text}
            <span className="mt-1 block text-right text-[11px] text-ink-muted">
              {message.time}
            </span>
          </li>
        ))}
      </ol>
      <figcaption className="text-center text-xs text-ink-muted">
        {phone.simulated}
      </figcaption>
    </figure>
  );
}

const INTEGRATION_ICONS = [
  Stethoscope,
  MessageCircle,
  CalendarDays,
  CalendarDays,
];

/** Intégrations en tuiles, comme la rangée d'icônes de Limova ; statut toujours écrit. */
function Integrations({ t, locale }: SiteProps) {
  const block = t.home.integrationsBlock;
  return (
    <div className="text-center">
      <ul className="mx-auto flex max-w-3xl flex-wrap justify-center gap-4">
        {t.integrations.items.map((item, index) => {
          const Icon = INTEGRATION_ICONS[index] ?? CalendarDays;
          return (
            <li
              key={item.name}
              className="flex w-40 flex-col items-center gap-3 rounded-[24px] border border-line/80 bg-white/[0.03] px-4 py-5 transition-all hover:-translate-y-1 hover:border-mint/30"
            >
              <span className="grid size-14 place-items-center rounded-2xl bg-white text-[#07603f] shadow-[0_10px_30px_-12px_rgb(140_232_195/0.6)]">
                <Icon aria-hidden="true" className="size-6" />
              </span>
              <span className="text-sm font-semibold">{item.name}</span>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                  item.status === "launch"
                    ? "bg-mint/10 text-mint"
                    : "bg-white/6 text-ink-muted",
                )}
              >
                {item.status === "launch" ? t.common.atLaunch : t.common.soon}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-10">
        <Badge>{t.home.badges.integrations}</Badge>
      </div>
      <SectionTitle
        id="integrations"
        title={block.title}
        lead={t.integrations.lead}
        center
        className="mt-5"
      />
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <CtaLink href={pathFor("trial", locale)}>{trialCta(locale, t)}</CtaLink>
        <CtaLink href={pathFor("integrations", locale)} tone="onDark">
          {block.link}
        </CtaLink>
      </div>
    </div>
  );
}
