"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { SectionBackdrop, sectionStyle } from "./section-backdrop";
import { sectionOf } from "./sections";

/**
 * Cadre du plan de travail : fixe la rubrique courante (`data-section`), ses teintes
 * (`--section-accent`, `--section-glow`) et dessine en tête son fond décoratif propre.
 * Le décor est masqué aux lecteurs d'écran et ne porte aucune information.
 */
export function SectionFrame({ children }: { children: ReactNode }) {
  const section = sectionOf(usePathname());
  return (
    <div
      data-section={section}
      className="relative isolate min-h-[inherit]"
      style={sectionStyle(section)}
    >
      <SectionBackdrop section={section} />
      {children}
    </div>
  );
}
