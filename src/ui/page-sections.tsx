import type { ReactNode } from "react";

/**
 * Longue page de réglages : sommaire collant à gauche sur grand écran (audit design,
 * point 5), simple colonne ailleurs. Chaque entrée mène à la carte de même `id`.
 */
export function PageSections({
  label,
  sections,
  children,
}: {
  /** Nom accessible du sommaire (« Sur cette page »). */
  label: string;
  sections: readonly { id: string; title: string }[];
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[12.5rem_minmax(0,1fr)] lg:gap-10">
      <nav aria-label={label} className="hidden lg:block">
        <p className="px-3 pb-2 tech-label text-ink-muted">{label}</p>
        <ul className="sticky top-6 space-y-0.5 border-l border-line">
          {sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="-ml-px block border-l-2 border-transparent py-1.5 pr-2 pl-3 text-sm text-ink-muted transition-colors hover:border-brand hover:text-ink"
              >
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="grid min-w-0 grid-cols-1 content-start gap-6">
        {children}
      </div>
    </div>
  );
}
