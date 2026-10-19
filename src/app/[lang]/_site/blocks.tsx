import { Check, FileWarning, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import type { Locale } from "@/i18n/locales";
import { pathFor } from "@/i18n/routes";
import type { SiteDictionary } from "@/i18n/site";
import { Card } from "@/ui/card";
import { cn } from "@/ui/cn";

import { CtaLink, trialCta } from "./chrome";
import { FaqList } from "./faq-list";

export function Section({
  children,
  className,
  labelledBy,
}: {
  children: ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cn("px-4 py-16 sm:py-20", className)}
    >
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

export function SectionTitle({
  id,
  title,
  lead,
  eyebrow,
  onDark = false,
  centered = false,
  className,
}: {
  id: string;
  title: string;
  lead?: string;
  /** Petite étiquette au-dessus du titre. */
  eyebrow?: string;
  onDark?: boolean;
  centered?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "max-w-2xl",
        centered && "mx-auto max-w-3xl text-center",
        className,
      )}
    >
      {eyebrow ? (
        <p
          className={cn(
            "mb-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold tracking-wide",
            onDark
              ? "border border-white/15 bg-white/5 text-mint"
              : "bg-brand-soft text-brand-ink",
          )}
        >
          {eyebrow}
        </p>
      ) : null}
      <h2
        id={id}
        className="font-display text-[1.85rem] leading-[1.1] font-bold tracking-[-0.025em] text-balance sm:text-[2.6rem]"
      >
        {title}
      </h2>
      {lead ? (
        <p
          className={cn(
            "mt-4 text-base sm:text-lg",
            onDark ? "text-white/75" : "text-ink-muted",
          )}
        >
          {lead}
        </p>
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
    <div className="relative overflow-hidden bg-night px-4 py-14 text-white sm:py-20">
      <div aria-hidden="true" className="absolute inset-0 site-halos" />
      <div
        className={cn(
          "relative mx-auto max-w-6xl",
          aside !== undefined &&
            "grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]",
        )}
      >
        <div className="min-w-0">
          <h1 className="max-w-3xl font-display text-[2rem] leading-[1.08] font-bold tracking-[-0.03em] text-balance sm:text-5xl">
            {title}
          </h1>
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
      <div className="relative overflow-hidden rounded-[24px] bg-night px-6 py-12 text-white sm:px-12">
        <div aria-hidden="true" className="absolute inset-0 site-halos" />
        <div className="relative max-w-2xl">
          <h2 className="font-display text-[1.85rem] leading-[1.1] font-bold tracking-[-0.025em] text-balance sm:text-[2.6rem]">
            {title}
          </h2>
          {body ? <p className="mt-3 text-white/80">{body}</p> : null}
          <div className="mt-8 flex flex-wrap gap-3">
            <CtaLink href={pathFor("trial", locale)} tone="mint">
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
}: {
  id: string;
  title: string;
  items: readonly { q: string; a: string }[];
}) {
  return (
    <div>
      <SectionTitle id={id} title={title} />
      <FaqList items={items} className="mt-8" />
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
