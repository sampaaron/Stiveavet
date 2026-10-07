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
};

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  headingLevel = 2,
}: SectionCardProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <Card className={cn("p-5 sm:p-6", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading className="text-base font-bold tracking-tight">
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

type StatCardProps = {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
  icon?: ReactNode;
};

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: StatCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2 text-sm font-medium text-ink-muted">
        <span>{label}</span>
        {icon ? <span aria-hidden="true">{icon}</span> : null}
      </div>
      <p
        className={cn(
          "mt-2 text-3xl font-bold tracking-tight tabular-nums",
          toneClasses[tone],
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-sm text-ink-muted">{hint}</p> : null}
    </Card>
  );
}
