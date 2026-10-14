import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: ReactNode;
  /** Petite ligne au-dessus du titre (date, rubrique). */
  eyebrow?: string;
  actions?: ReactNode;
};

/**
 * En-tête de page : repère « instrument » (petites capitales à chasse fixe), titre à
 * empattement comme le site public, actions à droite.
 */
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
          <p className="mb-2 flex items-center gap-2 tech-label text-brand-ink">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-brand"
            />
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
