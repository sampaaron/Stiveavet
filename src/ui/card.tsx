import type { ComponentProps, ReactNode } from "react";

import { cn } from "./cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]",
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
      <div className="-mx-5 mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 pb-4 sm:-mx-6 sm:px-6">
        <div className="min-w-0">
          <Heading className="flex items-center gap-2.5 text-base font-bold tracking-tight">
            <span
              aria-hidden="true"
              className="h-4 w-1 shrink-0 rounded-full bg-brand"
            />
            {title}
          </Heading>
          {description ? (
            <p className="mt-1 text-sm text-ink-muted">{description}</p>
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
      <div className="flex items-center justify-between gap-2 text-ink-muted">
        <span className="overline">{label}</span>
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
          "mt-3 font-mono text-[1.875rem] leading-none font-semibold tracking-tight tabular-nums",
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
