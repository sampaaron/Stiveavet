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
  className,
}: {
  id: string;
  title: string;
  lead?: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      <h2
        id={id}
        className="font-display text-[1.75rem] leading-tight font-semibold tracking-tight sm:text-4xl"
      >
        {title}
      </h2>
      {lead ? (
        <p className="mt-3 text-base text-ink-muted sm:text-lg">{lead}</p>
      ) : null}
    </div>
  );
}

/** En-tête des pages intérieures : titre éditorial sur fond clair. */
export function PageIntro({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children?: ReactNode;
}) {
  return (
    <div className="border-b border-line bg-surface px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <h1 className="max-w-3xl font-display text-[2rem] leading-tight font-semibold tracking-tight sm:text-5xl">
          {title}
        </h1>
        {lead ? (
          <p className="mt-4 max-w-2xl text-base text-ink-muted sm:text-lg">
            {lead}
          </p>
        ) : null}
        {children}
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
}: {
  assistant: "numa" | "stive";
  t: SiteDictionary;
  size?: number;
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
        className="shrink-0 rounded-full object-cover ring-4 ring-surface"
      />
      <div>
        <p className="text-xl font-bold">{name}</p>
        <p className="mt-1 w-fit rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
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
          <h2 className="font-display text-[1.75rem] leading-tight font-semibold sm:text-4xl">
            {title}
          </h2>
          {body ? <p className="mt-3 text-white/80">{body}</p> : null}
          <div className="mt-8 flex flex-wrap gap-3">
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
}: {
  id: string;
  title: string;
  items: readonly { q: string; a: string }[];
}) {
  return (
    <div>
      <SectionTitle id={id} title={title} />
      <div className="mt-8 divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
        {items.map((item) => (
          <details key={item.q} className="group px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
              {item.q}
              <span
                aria-hidden="true"
                className="grid size-7 shrink-0 place-items-center rounded-full bg-canvas-subtle text-ink-muted transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-3 text-ink-muted">{item.a}</p>
          </details>
        ))}
      </div>
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
