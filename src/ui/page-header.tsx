import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: ReactNode;
  /** Petite ligne au-dessus du titre (date, rubrique). */
  eyebrow?: string;
  actions?: ReactNode;
};

/** En-tête de page : titre à empattement, comme le site public, et actions à droite. */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: PageHeaderProps) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-sm font-semibold text-brand-ink first-letter:uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-[1.75rem] leading-tight font-semibold tracking-tight text-balance sm:text-[2.125rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-ink-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
