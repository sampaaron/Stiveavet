import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "./cn";

type Tab = { href: string; label: ReactNode; active: boolean };

/**
 * Onglets en pastilles sur un rail en verre dépoli (ADR 0033). Ce sont des liens : l'onglet
 * courant porte \`aria-current="page"\`, et la teinte suit la rubrique.
 */
export function SegmentedTabs({
  label,
  tabs,
  className,
}: {
  /** Nom accessible de la navigation. */
  label: string;
  tabs: readonly Tab[];
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-line/80 bg-surface/70 p-1 shadow-[0_1px_2px_rgb(11_18_32/0.04)] backdrop-blur-md",
        className,
      )}
    >
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-all duration-200",
            tab.active
              ? "bg-[var(--section-accent,var(--color-brand))] text-white shadow-[0_6px_16px_-8px_var(--section-accent,var(--color-brand))]"
              : "text-ink-muted hover:bg-surface hover:text-ink",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
