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
    className: "bg-brand-soft text-brand-ink",
  },
  watch: {
    icon: Eye,
    className: "bg-watch-soft text-watch",
  },
  urgent: {
    icon: CircleAlert,
    className: "bg-urgent-soft text-urgent",
  },
  paused: {
    icon: CirclePause,
    className: "bg-canvas-subtle text-ink-muted",
  },
  "consent-pending": {
    icon: Clock,
    className: "bg-canvas-subtle text-ink-muted",
  },
  "consent-given": {
    icon: CircleCheck,
    className: "bg-brand-soft text-brand-ink",
  },
  "consent-stopped": {
    icon: OctagonX,
    className: "bg-urgent-soft text-urgent",
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
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-semibold whitespace-nowrap",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" strokeWidth={2.25} />
      {label ?? t.ui.status[status]}
    </span>
  );
}
