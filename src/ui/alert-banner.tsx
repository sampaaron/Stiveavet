import { CircleAlert, CircleCheck, Eye, Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "./cn";

type Tone = "info" | "success" | "watch" | "urgent";

const tones: Record<
  Tone,
  { icon: LucideIcon; className: string; iconClassName: string }
> = {
  info: {
    icon: Info,
    className: "border-line bg-surface before:bg-line",
    iconClassName: "bg-canvas-subtle text-ink-muted",
  },
  success: {
    icon: CircleCheck,
    className: "border-brand/20 bg-surface before:bg-brand",
    iconClassName: "bg-brand-soft text-brand",
  },
  watch: {
    icon: Eye,
    className:
      "border-watch/25 bg-linear-to-r from-watch-soft to-surface before:bg-watch",
    iconClassName: "bg-watch-soft text-watch ring-1 ring-watch/20",
  },
  urgent: {
    icon: CircleAlert,
    className:
      "border-urgent/30 bg-linear-to-r from-urgent-soft to-surface before:bg-urgent",
    iconClassName: "bg-urgent text-white",
  },
};

type AlertBannerProps = {
  tone?: Tone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  /** Bandeau fin d'une ligne, pour les rappels communs à tout l'espace cabinet. */
  compact?: boolean;
};

/** Bandeau d'information. Le ton urgent est annoncé immédiatement aux lecteurs d'écran. */
export function AlertBanner({
  tone = "info",
  title,
  children,
  action,
  compact = false,
}: AlertBannerProps) {
  const { icon: Icon, className, iconClassName } = tones[tone];
  return (
    <div
      role={tone === "urgent" ? "alert" : "status"}
      className={cn(
        // Rail de gravité à gauche, comme sur un moniteur ; le titre porte le niveau.
        "relative flex overflow-hidden rounded-[var(--radius-card)] border shadow-[var(--shadow-card)] before:absolute before:inset-y-0 before:left-0 before:w-1",
        compact
          ? "flex-row flex-wrap items-center gap-x-3 gap-y-2 py-2.5 pr-4 pl-5"
          : "flex-col gap-3 py-4 pr-4 pl-5 sm:flex-row sm:items-center",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative grid shrink-0 place-items-center rounded-[var(--radius-control)]",
          compact ? "size-7" : "size-9",
          iconClassName,
        )}
      >
        {tone === "urgent" ? (
          <span className="absolute inset-0 signal-ping rounded-[inherit] bg-urgent" />
        ) : null}
        <Icon className={cn("relative", compact ? "size-4" : "size-[18px]")} />
      </span>
      <div className={cn("min-w-0 flex-1", compact && "basis-48")}>
        <p className={compact ? "text-sm font-medium" : "font-semibold"}>
          {title}
        </p>
        {children ? (
          <div className="mt-0.5 text-sm text-ink-muted">{children}</div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
