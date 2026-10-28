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
    className: "border-line bg-surface",
    iconClassName: "bg-canvas-subtle text-ink-muted",
  },
  success: {
    icon: CircleCheck,
    className: "border-brand/20 bg-brand-soft/60",
    iconClassName: "bg-surface text-brand",
  },
  watch: {
    icon: Eye,
    className: "border-watch/20 bg-watch-soft/70",
    iconClassName: "bg-surface text-watch",
  },
  urgent: {
    icon: CircleAlert,
    className: "border-urgent/25 bg-urgent-soft/70",
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
  /**
   * Annoncé aux lecteurs d'écran (par défaut). Faux pour une ligne d'une liste que la page
   * annonce déjà ailleurs, comme la boîte « À traiter ».
   */
  live?: boolean;
};

/** Bandeau d'information. Le ton urgent est annoncé immédiatement aux lecteurs d'écran. */
export function AlertBanner({
  tone = "info",
  title,
  children,
  action,
  compact = false,
  live = true,
}: AlertBannerProps) {
  const { icon: Icon, className, iconClassName } = tones[tone];
  return (
    <div
      role={live ? (tone === "urgent" ? "alert" : "status") : undefined}
      className={cn(
        "flex rounded-[var(--radius-card)] border",
        compact
          ? "flex-row flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5"
          : "flex-col gap-3 p-4 sm:flex-row sm:items-center",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid shrink-0 place-items-center rounded-full",
          compact ? "size-7" : "size-9",
          iconClassName,
        )}
      >
        <Icon className={compact ? "size-4" : "size-[18px]"} />
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
