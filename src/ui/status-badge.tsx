"use client";

import {
  CircleAlert,
  CircleCheck,
  CircleDot,
  CirclePause,
  Clock,
  Eye,
  OctagonX,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useAppText } from "@/i18n/app/client";

import { cn } from "./cn";

/**
 * Statuts affichés dans Stivea Vet. Chaque statut a toujours un libellé et une icône :
 * la couleur seule ne porte jamais l'information (référence visuelle, accessibilité).
 */
export type Status =
  | "normal"
  | "watch"
  | "urgent"
  | "paused"
  | "consent-pending"
  | "consent-given"
  | "consent-stopped";

const statuses: Record<Status, { icon: LucideIcon; className: string }> = {
  normal: {
    icon: CircleDot,
    className: "border-brand/25 bg-brand-soft/70 text-brand-ink",
  },
  watch: {
    icon: Eye,
    className: "border-watch/30 bg-watch-soft text-watch",
  },
  urgent: {
    icon: CircleAlert,
    className: "border-urgent/35 bg-urgent-soft text-urgent",
  },
  paused: {
    icon: CirclePause,
    className: "border-line bg-canvas-subtle text-ink-muted",
  },
  "consent-pending": {
    icon: Clock,
    className: "border-line bg-canvas-subtle text-ink-muted",
  },
  "consent-given": {
    icon: CircleCheck,
    className: "border-brand/25 bg-brand-soft/70 text-brand-ink",
  },
  "consent-stopped": {
    icon: OctagonX,
    className: "border-urgent/35 bg-urgent-soft text-urgent",
  },
};

export function StatusBadge({
  status,
  label,
}: {
  status: Status;
  label?: string;
}) {
  const t = useAppText();
  const { icon: Icon, className } = statuses[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[12.5px] font-semibold whitespace-nowrap",
        className,
      )}
    >
      {status === "urgent" ? (
        // Voyant « en direct » : la gravité est aussi dite par le libellé et l'icône.
        <span aria-hidden="true" className="relative flex size-1.5">
          <span className="absolute inset-0 signal-ping rounded-full bg-urgent" />
          <span className="relative size-1.5 rounded-full bg-urgent" />
        </span>
      ) : null}
      <Icon aria-hidden="true" className="size-3.5" strokeWidth={2.25} />
      {label ?? t.ui.status[status]}
    </span>
  );
}
