import Link from "next/link";

import type { AgendaEvent as AgendaEventData } from "@/fixtures/types";

import { cn } from "./cn";

const kindBorder: Record<AgendaEventData["kind"], string> = {
  consultation: "border-l-line",
  chirurgie: "border-l-accent",
  controle: "border-l-brand",
  urgence: "border-l-urgent",
};

const kindLabel: Record<AgendaEventData["kind"], string> = {
  consultation: "Consultation",
  chirurgie: "Chirurgie",
  controle: "Contrôle",
  urgence: "Urgence",
};

/** Événement d'agenda : bord gauche coloré par type, rendez-vous Stivea identifiés en clair. */
export function AgendaEvent({
  event,
  vetName,
  followupHref = (id) => `/app/suivis/${id}`,
}: {
  event: AgendaEventData;
  vetName: string;
  /** Adresse du suivi lié ; la démo du site public pointe vers sa propre page. */
  followupHref?: (followupId: string) => string;
}) {
  const body = (
    <>
      <span className="w-14 shrink-0 text-sm font-semibold tabular-nums">
        {event.time}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {event.title}
        </span>
        <span className="block text-xs text-ink-muted">
          {kindLabel[event.kind]} · {event.duration} · {vetName}
        </span>
      </span>
      {event.fromStivea ? (
        <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-ink">
          Stivea
        </span>
      ) : null}
    </>
  );
  const className = cn(
    "flex items-center gap-3 rounded-[10px] border border-l-4 border-line bg-surface px-3 py-2.5",
    kindBorder[event.kind],
  );
  return event.followupId ? (
    <Link
      href={followupHref(event.followupId)}
      className={cn(className, "hover:bg-canvas-subtle")}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
