import {
  Building2,
  Check,
  LifeBuoy,
  Lock,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { STARTING_PRICE_CENTS } from "@/domains/facturation/rules";
import { formatPrice } from "@/i18n/locales";
import { StatusBadge } from "@/ui/status-badge";
import { cn } from "@/ui/cn";

import type { SiteProps } from "./chrome";

/*
 * Visuels des en-têtes de pages intérieures (audit design, point 2). Chacun illustre le
 * propos de sa page avec des données fictives signalées comme telles ; aucun ne porte une
 * information absente du texte de la page.
 */

const PANEL =
  "rounded-[24px] bg-white/[0.06] p-5 ring-1 ring-white/12 backdrop-blur-sm sm:p-6";

/** Fonctionnement : la frise d'un suivi, du lancement à la synthèse. */
export function HowVisual({ t }: Pick<SiteProps, "t">) {
  const visual = t.how.visual;
  const levels = t.how.triage;
  const levelName = (level: string) =>
    levels.find((row) => row.level === level)?.name ?? level;
  return (
    <figure aria-label={visual.label} className={PANEL}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{visual.patient}</p>
        <p className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-white/85">
          {visual.vet}
        </p>
      </div>
      <ol className="relative mt-5 grid gap-4 before:absolute before:top-2 before:bottom-2 before:left-[1.4rem] before:w-px before:bg-white/15">
        {visual.steps.map((step) => (
          <li
            key={step.day + step.text}
            className="relative flex items-start gap-3"
          >
            <span className="grid h-7 w-11 shrink-0 place-items-center rounded-full bg-night-soft text-xs font-semibold text-mint ring-1 ring-white/15">
              {step.day}
            </span>
            <span className="min-w-0 pt-0.5 text-sm">
              <span className="text-white/90">{step.text}</span>
              {step.level === "watch" || step.level === "normal" ? (
                <span className="mt-1.5 block">
                  <StatusBadge
                    status={step.level}
                    label={levelName(step.level)}
                  />
                </span>
              ) : null}
            </span>
            {step.level === "done" ? (
              <Check
                aria-hidden="true"
                className="mt-1 ml-auto size-4 shrink-0 text-mint"
              />
            ) : null}
          </li>
        ))}
      </ol>
      <figcaption className="mt-5 text-xs text-white/70">
        {visual.fictitious}
      </figcaption>
    </figure>
  );
}

/** Sécurité : deux cabinets, deux espaces étanches, et ce qui les protège. */
export function SecurityVisual({ t }: Pick<SiteProps, "t">) {
  const visual = t.security.visual;
  return (
    <figure aria-label={visual.label} className={PANEL}>
      <div className="relative grid grid-cols-2 gap-6">
        {visual.cabinets.map((cabinet) => (
          <div
            key={cabinet}
            className="min-w-0 rounded-[16px] bg-night-soft p-4 ring-1 ring-white/10"
          >
            <div className="flex items-center justify-between gap-2">
              <Building2 aria-hidden="true" className="size-5 text-mint" />
              <Lock aria-hidden="true" className="size-4 text-white/70" />
            </div>
            <p className="mt-3 text-sm leading-snug font-semibold">{cabinet}</p>
            <div aria-hidden="true" className="mt-3 grid gap-1.5">
              <span className="h-1.5 w-full rounded-full bg-white/12" />
              <span className="h-1.5 w-4/5 rounded-full bg-white/12" />
              <span className="h-1.5 w-3/5 rounded-full bg-white/12" />
            </div>
          </div>
        ))}
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 border-l border-dashed border-mint/60"
        />
        <span
          aria-hidden="true"
          className="absolute top-1/2 left-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-night ring-1 ring-mint/50"
        >
          <ShieldCheck className="size-4 text-mint" />
        </span>
      </div>
      <figcaption className="mt-4 text-center text-sm font-semibold text-mint">
        {visual.wall}
      </figcaption>
      <ul className="mt-5 flex flex-wrap gap-2">
        {visual.chips.map((chip) => (
          <li
            key={chip}
            className="rounded-full bg-white/8 px-3 py-1 text-xs text-white/85 ring-1 ring-white/10"
          >
            {chip}
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Intégrations : Stivea Vet au centre de ce qu'il relie. */
export function IntegrationsVisual({ t }: Pick<SiteProps, "t">) {
  const visual = t.integrations.visual;
  return (
    <figure aria-label={visual.label} className={cn(PANEL, "relative")}>
      <svg
        aria-hidden="true"
        className="absolute inset-0 size-full text-mint/50"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        {[
          [27, 30],
          [73, 30],
          [27, 70],
          [73, 70],
        ].map(([x, y]) => (
          <line
            key={`${x}-${y}`}
            x1="50"
            y1="50"
            x2={x}
            y2={y}
            stroke="currentColor"
            strokeDasharray="1.5 1.5"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <ul className="relative grid grid-cols-2 gap-x-4 gap-y-16">
        {visual.nodes.map((node) => (
          <li
            key={node.name}
            className="min-w-0 rounded-[16px] bg-night-soft p-3.5 ring-1 ring-white/10"
          >
            <p className="text-sm leading-snug font-semibold">{node.name}</p>
            <p className="mt-1 text-xs text-white/70">{node.note}</p>
          </li>
        ))}
      </ul>
      <span className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full bg-brand px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap text-white shadow-[0_0_0_6px_rgb(140_232_195/0.12)]">
        <Sparkles aria-hidden="true" className="size-4" />
        Stivea Vet
      </span>
    </figure>
  );
}

/** Tarifs : le prix d'entrée, tiré du catalogue de facturation. */
export function PricingVisual({ locale, t }: SiteProps) {
  const visual = t.pricing.visual;
  return (
    <div className={PANEL}>
      <p className="text-sm text-white/80">{visual.from}</p>
      <p className="mt-1 font-display text-6xl leading-none font-semibold tracking-tight">
        {formatPrice(STARTING_PRICE_CENTS, locale)}
      </p>
      <p className="mt-2 text-sm text-white/80">{visual.unit}</p>
      <ul className="mt-5 grid gap-2.5 border-t border-white/12 pt-5 text-sm">
        {visual.points.map((point) => (
          <li key={point} className="flex items-start gap-2.5">
            <Check
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-mint"
            />
            <span className="text-white/90">{point}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Centre d'aide : comment joindre l'assistance. */
export function SupportVisual({ t }: Pick<SiteProps, "t">) {
  const help = t.help;
  return (
    <section aria-labelledby="assistance" className={PANEL}>
      <span className="grid size-11 place-items-center rounded-full bg-mint/15 text-mint">
        <LifeBuoy aria-hidden="true" className="size-5" />
      </span>
      <h2 id="assistance" className="mt-4 text-lg font-bold">
        {help.supportTitle}
      </h2>
      <p className="mt-2 text-sm text-white/80">{help.support}</p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {help.supportChannels.map((channel) => (
          <li
            key={channel}
            className="rounded-full bg-white/8 px-3 py-1 text-xs text-white/85 ring-1 ring-white/10"
          >
            {channel}
          </li>
        ))}
      </ul>
    </section>
  );
}
