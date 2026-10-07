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
    iconClassName: "text-ink-muted",
  },
  success: {
    icon: CircleCheck,
    className: "border-brand/20 bg-brand-soft",
    iconClassName: "text-brand",
  },
  watch: {
    icon: Eye,
    className: "border-watch/20 bg-watch-soft",
    iconClassName: "text-watch",
  },
  urgent: {
    icon: CircleAlert,
    className: "border-urgent/25 bg-urgent-soft",
    iconClassName: "text-urgent",
  },
};

type AlertBannerProps = {
  tone?: Tone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
};

/** Bandeau d'information. Le ton urgent est annoncé immédiatement aux lecteurs d'écran. */
export function AlertBanner({
  tone = "info",
  title,
  children,
  action,
}: AlertBannerProps) {
  const { icon: Icon, className, iconClassName } = tones[tone];
  return (
    <div
      role={tone === "urgent" ? "alert" : "status"}
      className={cn(
        "flex flex-col gap-3 rounded-[var(--radius-card)] border p-4 sm:flex-row sm:items-center",
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn("size-5 shrink-0", iconClassName)}
      />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {children ? (
          <div className="mt-0.5 text-sm text-ink-muted">{children}</div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
