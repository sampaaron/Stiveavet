import { QrCode } from "lucide-react";

import { ButtonLink } from "@/ui/button";
import { cn } from "@/ui/cn";

/**
 * Accord WhatsApp à recueillir (ADR 0051), mis en avant là où il manque : un encadré qui mène
 * au QR code à montrer au propriétaire.
 */
export function OptInQrCallout({
  followupId,
  title,
  body,
  action,
  actionSuffix,
  stacked = false,
  className,
}: {
  followupId: string;
  title: string;
  body: string;
  action: string;
  /** Complément lu par les lecteurs d'écran (nom de l'animal dans une liste). */
  actionSuffix?: string;
  /** Bouton sous le texte, pour une colonne étroite. */
  stacked?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-[var(--radius-card)] border-2 border-brand/30 bg-brand-soft/60 p-4",
        !stacked && "sm:flex-row sm:items-center",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <span
          aria-hidden="true"
          className="grid size-14 shrink-0 place-items-center rounded-[var(--radius-control)] bg-surface text-brand-ink shadow-[var(--shadow-pill)]"
        >
          <QrCode className="size-8" />
        </span>
        <div className="min-w-0">
          <p className="font-bold text-brand-ink">{title}</p>
          <p className="mt-0.5 text-sm">{body}</p>
        </div>
      </div>
      <ButtonLink
        href={`/app/suivis/${followupId}/accord`}
        className={cn("shrink-0 self-start", !stacked && "sm:self-center")}
        icon={<QrCode aria-hidden="true" className="size-4" />}
      >
        {action}
        {actionSuffix ? <span className="sr-only">{actionSuffix}</span> : null}
      </ButtonLink>
    </div>
  );
}
