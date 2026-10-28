import { Check, FileWarning, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { ViewTransition } from "react";
import type { CSSProperties, ReactNode } from "react";

import type { Locale } from "@/i18n/locales";
import { pathFor } from "@/i18n/routes";
import type { SiteDictionary } from "@/i18n/site";
import { Card } from "@/ui/card";
import { cn } from "@/ui/cn";
import { SectionBackdrop } from "@/ui/section-backdrop";
import { sectionAccents } from "@/ui/sections";
import type { Section as Rubrique } from "@/ui/sections";

import { CtaLink, trialCta } from "./chrome";

/**
 * Section du site. Avec `theme`, elle prend l'identité d'une rubrique de l'espace cabinet
 * (teinte et motif, ADR 0043) : le site et le logiciel se répondent.
 */
export function Section({
  children,
  className,
  labelledBy,
  theme,
  tinted = false,
}: {
  children: ReactNode;
  className?: string;
  labelledBy?: string;
  theme?: Rubrique;
  /** Bande plus claire pour détacher la section ; elle entre et sort en dégradé, sans bord. */
  tinted?: boolean;
}) {
  return (
    // Sans `isolate` ni `overflow-hidden` : le fond de la rubrique passe sous le contenu de
    // toute la page (contexte d'empilement du site) et se fond dans les sections voisines.
    <section
      aria-labelledby={labelledBy}
      className={cn("relative px-4 py-16 sm:py-24", className)}
      // Sur la nuit du site, la teinte claire de la rubrique sert d'accent (lisible sur sombre).
      style={
        theme
          ? ({
              "--section-accent": sectionAccents[theme].glow,
              "--section-glow": sectionAccents[theme].accent,
            } as CSSProperties)
          : undefined
      }
    >
      {tinted ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -inset-y-16 -z-20 bg-surface [mask-image:linear-gradient(to_bottom,transparent,black_12rem,black_calc(100%-12rem),transparent)]"
        />
      ) : null}
      {theme ? <SectionBackdrop section={theme} blend /> : null}
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

/** Petite étiquette au-dessus d'un titre de section, comme chez Limova. */
export function Badge({ children }: { children: ReactNode }) {
  return (
    <p className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--section-accent,#8ce8c3)]/30 bg-[var(--section-accent,#8ce8c3)]/[0.07] px-3 py-1 text-[11px] font-bold tracking-[0.14em] text-[var(--section-accent,#8ce8c3)] uppercase">
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full bg-[var(--section-accent,#8ce8c3)] shadow-[0_0_8px_var(--section-accent,#8ce8c3)]"
      />
      {children}
    </p>
  );
}

export function SectionTitle({
  id,
  title,
  lead,
  className,
  center = false,
}: {
  id: string;
  title: string;
  lead?: string;
  className?: string;
  /** Titre centré (sections plein écran). */
  center?: boolean;
}) {
  return (
    <div
      className={cn(
        center ? "mx-auto max-w-3xl text-center" : "max-w-2xl",
        className,
      )}
    >
      <h2
        id={id}
        className="font-display text-[1.95rem] leading-[1.08] font-extrabold tracking-[-0.03em] text-balance sm:text-[2.85rem]"
      >
        {title}
      </h2>
      {lead ? (
        <p className="mt-3 text-base text-ink-muted sm:text-lg">{lead}</p>
      ) : null}
    </div>
  );
}

/**
 * En-tête des pages intérieures : titre éditorial sur la nuit du héros, avec ses halos, et
 * à droite, sur grand écran, le visuel propre à la page (audit design, point 2).
 */
export function PageIntro({
  title,
  lead,
  children,
  aside,
}: {
  title: string;
  lead?: string;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="relative px-4 py-16 text-white sm:py-24">
      {/* Nuit et halos débordent sous la section suivante et s'y effacent : pas de bord. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -bottom-48 -z-10 bg-night fade-out-bottom [--fade-length:16rem]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -bottom-48 -z-10 fade-out-bottom [--fade-length:16rem] site-halos"
      />
      <div
        className={cn(
          "relative mx-auto max-w-6xl",
          aside !== undefined &&
            "grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]",
        )}
      >
        <div className="min-w-0">
          <ViewTransition
            name="site-title"
            share="site-title-morph"
            default="none"
          >
            <h1 className="max-w-3xl font-display text-[2.2rem] leading-[1.04] font-extrabold tracking-[-0.035em] text-balance sm:text-[3.5rem]">
              {title}
            </h1>
          </ViewTransition>
          {lead ? (
            <p className="mt-4 max-w-2xl text-base text-white/80 sm:text-lg">
              {lead}
            </p>
          ) : null}
          {children}
        </div>
        {aside !== undefined ? <div className="min-w-0">{aside}</div> : null}
      </div>
    </div>
  );
}

export function CheckList({
  items,
  tone = "brand",
  className,
}: {
  items: readonly string[];
  tone?: "brand" | "never";
  className?: string;
}) {
  const Icon = tone === "brand" ? Check : X;
  return (
    <ul className={cn("grid gap-3", className)}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3">
          <span
            className={cn(
              "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
              tone === "brand"
                ? "bg-brand-soft text-brand-ink"
                : "bg-canvas-subtle text-ink",
            )}
          >
            <Icon aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Portrait de Numa ou Stive : la mention IA l'accompagne toujours (principe n° 3). */
export function AssistantPortrait({
  assistant,
  t,
  size = 72,
  onDark = false,
}: {
  assistant: "numa" | "stive";
  t: SiteDictionary;
  size?: number;
  /** Sur un fond sombre (en-tête des pages). */
  onDark?: boolean;
}) {
  const name = assistant === "numa" ? "Numa" : "Stive";
  const ai = assistant === "numa" ? t.common.numaAi : t.common.stiveAi;
  return (
    <div className="flex items-center gap-4">
      <Image
        src={`/assistants/${assistant}.webp`}
        alt={`${name}, ${ai}`}
        width={size}
        height={size}
        className={cn(
          "shrink-0 rounded-full object-cover ring-4",
          onDark ? "ring-white/15" : "ring-surface",
        )}
      />
      <div>
        <p className="text-xl font-bold">{name}</p>
        <p
          className={cn(
            "mt-1 w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold",
            onDark ? "bg-white/10 text-mint" : "bg-accent/10 text-accent",
          )}
        >
          {ai}
        </p>
      </div>
    </div>
  );
}

export function CtaBand({
  locale,
  t,
  title,
  body,
}: {
  locale: Locale;
  t: SiteDictionary;
  title: string;
  body?: string;
}) {
  return (
    <Section className="pt-0 sm:pt-0">
      <div className="relative isolate overflow-hidden rounded-[36px] border border-white/10 bg-night px-6 py-16 text-center text-white shadow-[0_40px_100px_-40px_rgb(8_122_84/0.7)] sm:px-14 sm:py-24">
        <div aria-hidden="true" className="absolute inset-0 -z-10 hero-glow" />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(rgb(255_255_255/0.06)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)] [background-size:22px_22px]"
        />
        <div className="relative mx-auto max-w-3xl">
          <h2 className="font-display text-[2rem] leading-[1.06] font-extrabold tracking-[-0.03em] text-balance sm:text-5xl">
            {title}
          </h2>
          {body ? (
            <p className="mx-auto mt-4 max-w-xl text-white/75">{body}</p>
          ) : null}
          <div className="mt-9 flex flex-wrap justify-center gap-3">
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
  );
}

export function Faq({
  id,
  title,
  items,
  center = false,
}: {
  id: string;
  title: string;
  items: readonly { q: string; a: string }[];
  center?: boolean;
}) {
  return (
    <div>
      <SectionTitle
        id={id}
        title={title}
        center={center}
        className={center ? "mt-5" : undefined}
      />
      <FaqList items={items} className="mt-10" />
    </div>
  );
}

/** Questions dépliables, sans script : `<details>` natif, utilisable au clavier. */
export function FaqList({
  items,
  className,
}: {
  items: readonly { q: string; a: string }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "divide-y divide-line overflow-hidden rounded-[24px] border border-line/80 bg-surface/90 shadow-[var(--shadow-card)] backdrop-blur-xl",
        className,
      )}
    >
      {items.map((item) => (
        <details
          key={item.q}
          className="group px-6 py-5 transition-colors open:bg-canvas/60"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
            {item.q}
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--section-accent,var(--color-brand))]/10 text-[var(--section-accent,var(--color-brand-ink))] transition-transform duration-300 group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <p className="mt-3 text-ink-muted">{item.a}</p>
        </details>
      ))}
    </div>
  );
}

/** Bandeau des documents juridiques : projet tant qu'un juriste ne l'a pas validé (cahier §19). */
export function LegalDraft({ t }: { t: SiteDictionary }) {
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-watch/30 bg-watch-soft p-4 text-sm text-watch">
      <FileWarning aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div>
        <p className="font-semibold">{t.legal.draft}</p>
        <p className="mt-1">{t.legal.updated}</p>
      </div>
    </div>
  );
}

export function TextSections({
  sections,
}: {
  sections: readonly { title: string; body: string }[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {sections.map((section) => (
        <Card key={section.title} className="p-6">
          <h2 className="text-lg font-bold">{section.title}</h2>
          <p className="mt-2 text-ink-muted">{section.body}</p>
        </Card>
      ))}
    </div>
  );
}

export function TextLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="font-semibold text-brand-ink underline-offset-2 hover:underline"
    >
      {children}
    </Link>
  );
}
