import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: ReactNode;
  /** Petite ligne au-dessus du titre (date, rubrique). */
  eyebrow?: string;
  actions?: ReactNode;
};

/**
 * En-tête de page : filet et surtitre à la teinte de la rubrique (`--section-accent`,
 * ADR 0033), grand titre à empattement comme le site public, actions à droite.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: PageHeaderProps) {
  return (
    <header className="mb-9 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pt-1 sm:pt-3">
      <div className="min-w-0">
        <p className="mb-3 flex items-center gap-2.5 text-[13px] font-semibold text-[var(--section-accent,var(--color-brand-ink))]">
          <span
            aria-hidden="true"
            className="h-[3px] w-7 rounded-full bg-[var(--section-accent,var(--color-brand))] shadow-[0_0_14px_var(--section-glow,transparent)]"
          />
          {eyebrow ? (
            <span className="first-letter:uppercase">{eyebrow}</span>
          ) : null}
        </p>
        <h1 className="font-display text-[2rem] leading-[1.08] font-semibold tracking-[-0.02em] text-balance sm:text-[2.75rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-muted sm:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap gap-2 rounded-full bg-surface/60 p-1 ring-1 ring-line/70 backdrop-blur-md empty:hidden">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
