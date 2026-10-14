import type { ReactNode } from "react";

import { AnimalAvatar } from "./animal-avatar";
import { cn } from "./cn";

export type Vital = {
  label: string;
  value: ReactNode;
  /** Valeur chiffrée (âge, poids, date) : chasse fixe. */
  mono?: boolean;
};

type PatientHeaderProps = {
  name: string;
  species: "dog" | "cat";
  /** Badges à côté du nom (gravité, dossier privé, test). */
  badges?: ReactNode;
  subtitle?: ReactNode;
  /** Relevé principal à droite, par exemple le jour post-opératoire. */
  readout?: { label: string; value: string };
  /** Boutons de la fiche (modifier, archiver). */
  actions?: ReactNode;
  vitals: Vital[];
  /** Avancée vers le contrôle, de 0 à 100, avec les repères de début et de fin. */
  timeline?: { progress: number; start: string; end: string };
};

/**
 * En-tête « fiche patient » : identité, relevé principal et constantes du dossier. La
 * frise vers le contrôle est décorative, la date de contrôle figure dans les constantes.
 */
export function PatientHeader({
  name,
  species,
  badges,
  subtitle,
  readout,
  actions,
  vitals,
  timeline,
}: PatientHeaderProps) {
  return (
    <header className="mb-6 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]">
      <div className="relative isolate flex flex-wrap items-start gap-4 p-5 sm:p-6">
        <SignalTrace />
        <AnimalAvatar name={name} species={species} size="lg" />
        <div className="relative min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-[1.75rem] leading-tight font-semibold tracking-tight sm:text-[2rem]">
              {name}
            </h1>
            {badges}
          </div>
          {subtitle ? <p className="mt-1 text-ink-muted">{subtitle}</p> : null}
        </div>
        {readout ? (
          <div className="relative rounded-[var(--radius-control)] border border-line bg-canvas px-4 py-2.5 text-right">
            <p className="tech-label text-ink-muted">{readout.label}</p>
            <p className="mt-1 font-mono text-2xl leading-none font-semibold text-brand-ink tabular-nums">
              {readout.value}
            </p>
          </div>
        ) : null}
        {actions ? (
          <div className="relative flex flex-wrap items-start gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      {timeline ? (
        <div aria-hidden="true" className="px-5 pb-4 sm:px-6">
          <div className="relative h-1.5 rounded-full bg-canvas-subtle">
            <div
              className="h-full rounded-full bg-linear-to-r from-brand/50 to-brand"
              style={{
                width: `${Math.min(100, Math.max(timeline.progress, 2))}%`,
              }}
            />
            <span
              className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-brand shadow-[0_0_0_4px_rgb(15_118_110/0.15)]"
              style={{
                left: `${Math.min(100, Math.max(timeline.progress, 2))}%`,
              }}
            />
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[11px] text-ink-muted">
            <span>{timeline.start}</span>
            <span>{timeline.end}</span>
          </div>
        </div>
      ) : null}
      <dl
        className={cn(
          "-ml-px grid grid-cols-2 sm:grid-cols-3",
          vitals.length > 3 && "xl:grid-cols-6",
        )}
      >
        {vitals.map((vital) => (
          <div
            key={vital.label}
            className="min-w-0 border-t border-l border-line px-5 py-3.5 sm:px-6"
          >
            <dt className="tech-label text-ink-muted">{vital.label}</dt>
            <dd
              className={cn(
                "mt-1 text-sm font-semibold [overflow-wrap:anywhere] text-ink",
                vital.mono && "font-mono tabular-nums",
              )}
            >
              {vital.value}
            </dd>
          </div>
        ))}
      </dl>
    </header>
  );
}

/** Tracé de moniteur en filigrane, purement décoratif. */
export function SignalTrace({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 320 60"
      preserveAspectRatio="none"
      className={cn(
        "pointer-events-none absolute top-1/2 right-0 -z-10 h-14 w-2/3 -translate-y-1/2 [mask-image:linear-gradient(90deg,transparent,#000_55%)] text-brand opacity-[0.08]",
        className,
      )}
    >
      <path
        d="M0 30 H120 L130 30 L138 12 L146 50 L154 22 L160 30 H200 L208 26 L214 30 H320"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
