"use client";

import { useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { cn } from "@/ui/cn";

import { FaqList } from "./faq-list";

type Tab = { label: string; items: readonly { q: string; a: string }[] };

/**
 * Questions fréquentes par thème, en onglets (modèle ARIA « tabs ») : flèches gauche et
 * droite, Début et Fin pour changer d'onglet ; seul l'onglet actif est dans l'ordre du Tab.
 */
export function FaqTabs({ label, tabs }: { label: string; tabs: Tab[] }) {
  const id = useId();
  const [active, setActive] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function select(index: number) {
    const next = (index + tabs.length) % tabs.length;
    setActive(next);
    buttons.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const moves: Record<string, number> = {
      ArrowRight: active + 1,
      ArrowLeft: active - 1,
      Home: 0,
      End: tabs.length - 1,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    select(target);
  }

  const current = tabs[active];
  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        className="flex w-fit max-w-full flex-wrap gap-1 rounded-full bg-canvas-subtle p-1"
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.label}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-selected={index === active}
            aria-controls={`${id}-panel`}
            tabIndex={index === active ? 0 : -1}
            onClick={() => setActive(index)}
            onKeyDown={onKeyDown}
            className={cn(
              "min-h-10 rounded-full px-4 text-sm font-semibold transition-colors",
              index === active
                ? "bg-surface text-ink shadow-[var(--shadow-pill)]"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {current ? (
        <div
          role="tabpanel"
          id={`${id}-panel`}
          aria-labelledby={`${id}-tab-${active}`}
          className="mt-6"
        >
          <FaqList items={current.items} />
        </div>
      ) : null}
    </div>
  );
}
