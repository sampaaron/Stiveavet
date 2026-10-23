import type { ComponentProps, ReactNode } from "react";

import { cn } from "./cn";

export function Card({
  className,
  bare = false,
  ...props
}: ComponentProps<"div"> & {
  /** Sans cadre : pour une liste dont chaque ligne est déjà une carte. */
  bare?: boolean;
}) {
  return (
    <div
      className={cn(
        !bare &&
          "rounded-[var(--radius-card)] border border-line/80 bg-surface/92 shadow-[var(--shadow-card),inset_0_1px_0_rgb(255_255_255/0.9)] backdrop-blur-xl",
        className,
      )}
      {...props}
    />
  );
}

type SectionCardProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Niveau du titre dans la page, pour garder une hiérarchie correcte. */
  headingLevel?: 2 | 3;
  /** Ancre de la carte, pour le sommaire d'une longue page (`PageSections`). */
  id?: string;
};

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  headingLevel = 2,
  id,
}: SectionCardProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <Card id={id} className={cn("scroll-mt-6 p-5 sm:p-6", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Heading className="text-[17px] font-bold tracking-tight">
            {title}
          </Heading>
          {description ? (
            <p className="mt-0.5 text-sm text-ink-muted">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

type Tone = "neutral" | "brand" | "watch" | "urgent";

const toneClasses: Record<Tone, string> = {
  neutral: "text-ink",
  brand: "text-brand-ink",
  watch: "text-watch",
  urgent: "text-urgent",
};

const iconTones: Record<Tone, string> = {
  neutral: "bg-canvas-subtle text-ink-muted",
  brand: "bg-brand-soft text-brand-ink",
  watch: "bg-watch-soft text-watch",
  urgent: "bg-urgent-soft text-urgent",
};

type StatCardProps = {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
  icon?: ReactNode;
  /** Complément sous la valeur (jauge, lien). */
  children?: ReactNode;
};

/** Chiffre clé sans cadre, pour les bandeaux de chiffres (`StatGrid`). */
export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
  children,
  className,
}: StatCardProps & { className?: string }) {
  return (
    <div className={cn("bg-surface p-5", className)}>
      <div className="flex items-center justify-between gap-2 text-sm font-medium text-ink-muted">
        <span>{label}</span>
        {icon ? (
          <span
            aria-hidden="true"
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-full",
              iconTones[tone],
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "mt-2 font-display text-[2rem] leading-none font-semibold tracking-tight tabular-nums",
          toneClasses[tone],
        )}
      >
        {value}
      </p>
      {children ? <div className="mt-3">{children}</div> : null}
      {hint ? <p className="mt-1.5 text-sm text-ink-muted">{hint}</p> : null}
    </div>
  );
}

/** Bandeau de chiffres clés : une seule carte, séparée par de fins filets. */
export function StatGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "grid gap-px overflow-hidden bg-line sm:grid-cols-2 xl:grid-cols-4",
        className,
      )}
    >
      {children}
    </Card>
  );
}

export function StatCard(props: StatCardProps) {
  return (
    <Card className="overflow-hidden">
      <StatTile {...props} />
    </Card>
  );
}

/** Fait d'une fiche, dans une liste de définitions (`<dl>`) : libellé discret, valeur. */
export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
