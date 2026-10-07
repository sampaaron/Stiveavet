import { Cat, ChevronRight, Dog } from "lucide-react";
import Link from "next/link";

import type { Followup } from "@/fixtures/types";

import { cn } from "./cn";
import { StatusBadge } from "./status-badge";
import type { Status } from "./status-badge";

export function SpeciesIcon({
  species,
  className,
}: {
  species: Followup["animal"]["species"];
  className?: string;
}) {
  const Icon = species === "chat" ? Cat : Dog;
  return <Icon aria-hidden="true" className={cn("size-5", className)} />;
}

/** Statut principal d'un suivi : la gravité prime, puis l'état du suivi. */
export function followupStatus(followup: Followup): Status {
  if (followup.triage !== "normal") return followup.triage;
  if (followup.state === "paused") return "paused";
  if (
    followup.owners.some(
      (owner) => owner.role === "principal" && owner.consent === "pending",
    )
  ) {
    return "consent-pending";
  }
  return "normal";
}

type FollowupCardProps = { followup: Followup; vetName: string };

/** Ligne de suivi cliquable, utilisée dans les priorités et la liste des suivis. */
export function FollowupCard({ followup, vetName }: FollowupCardProps) {
  const { animal } = followup;
  return (
    <Link
      href={`/app/suivis/${followup.id}`}
      className="group flex items-center gap-4 rounded-[var(--radius-control)] px-3 py-3 transition-colors hover:bg-canvas-subtle"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-canvas-subtle text-ink-muted group-hover:bg-surface">
        <SpeciesIcon species={animal.species} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold">{animal.name}</span>
          <StatusBadge status={followupStatus(followup)} />
        </span>
        <span className="mt-0.5 block truncate text-sm text-ink-muted">
          {followup.summaryLine}
        </span>
      </span>
      <span className="hidden shrink-0 text-right text-sm text-ink-muted sm:block">
        <span className="block">
          {followup.procedure} · {followup.dayLabel}
        </span>
        <span className="block">
          {vetName} · {followup.lastActivity}
        </span>
      </span>
      <ChevronRight
        aria-hidden="true"
        className="size-4 shrink-0 text-ink-muted"
      />
    </Link>
  );
}
