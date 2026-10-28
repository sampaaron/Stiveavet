import type { CSSProperties } from "react";

import { cn } from "./cn";
import { SectionMotif } from "./section-motif";
import { sectionAccents } from "./sections";
import type { Section } from "./sections";

/** Teintes d'une rubrique en variables CSS (`--section-accent`, `--section-glow`). */
export function sectionStyle(section: Section): CSSProperties {
  const { accent, glow } = sectionAccents[section];
  return {
    "--section-accent": accent,
    "--section-glow": glow,
  } as CSSProperties;
}

/**
 * Fond décoratif d'une rubrique, partagé par l'espace cabinet et le site public :
 * lueurs et motif fin. À placer dans un parent `relative isolate` qui porte `sectionStyle`.
 */
export function SectionBackdrop({
  section,
  className,
  blend = false,
}: {
  section: Section;
  className?: string;
  /**
   * Site public : le fond déborde au-dessus et au-dessous de la section et s'estompe aux deux
   * bouts, pour se fondre dans la section voisine sans bord visible.
   */
  blend?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-x-0 -z-10 overflow-hidden",
        blend
          ? "-top-40 h-[46rem] section-backdrop-blend"
          : "top-0 h-[24rem] section-backdrop",
        className,
      )}
    >
      <svg
        viewBox="0 0 640 320"
        preserveAspectRatio="xMaxYMin slice"
        className="absolute top-0 right-0 h-full w-[min(100%,52rem)] section-motif text-[var(--section-accent)]"
        fill="none"
        stroke="currentColor"
      >
        <SectionMotif section={section} />
      </svg>
    </div>
  );
}
