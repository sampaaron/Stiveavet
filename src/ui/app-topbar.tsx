"use client";

import { Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { useAppText } from "@/i18n/app/client";

import { AlertsBell } from "./sidebar-nav";

/** Écrans qui ont déjà leur propre recherche. */
const OWN_SEARCH = [
  "/app",
  "/app/suivis",
  "/app/suivis/nouveau",
  "/app/animaux",
];

/**
 * Barre du haut de l'espace cabinet : recherche des suivis (touche « / », champ
 * `recherche-globale`, celui du tableau de bord sur /app) et cloche des alertes. La recherche ouvre la liste des suivis filtrée ; le serveur n'y montre que ce que
 * la personne a le droit de voir.
 */
export function AppTopbar({
  canSearch,
  canSeeAlerts,
  pendingAlerts,
}: {
  canSearch: boolean;
  canSeeAlerts: boolean;
  pendingAlerts: number;
}) {
  const t = useAppText().shell;
  const pathname = usePathname();
  const showSearch = canSearch && !OWN_SEARCH.includes(pathname);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']"))
        return;
      const search = document.getElementById("recherche-globale");
      if (!search) return;
      event.preventDefault();
      search.focus();
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  // Sans recherche, la cloche est déjà dans la barre latérale (ordinateur) ou l'en-tête (mobile).
  if (!showSearch) return null;
  return (
    <div className="flex items-center gap-2 px-4 pt-4 sm:px-8 lg:px-10 lg:pt-6">
      {canSearch ? (
        <form
          action="/app/suivis"
          role="search"
          className="group relative min-w-0 flex-1 lg:max-w-md"
        >
          <label htmlFor="recherche-globale" className="sr-only">
            {t.search.label}
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-muted"
          />
          <input
            id="recherche-globale"
            name="q"
            type="search"
            autoComplete="off"
            placeholder={t.search.placeholder}
            aria-describedby="recherche-globale-aide"
            className="h-11 w-full rounded-full border border-line bg-surface pr-12 pl-10 text-sm text-ink shadow-[var(--shadow-pill)] placeholder:text-ink-muted focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
          />
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-md border border-line bg-canvas px-1.5 font-sans text-xs text-ink-muted sm:block"
          >
            /
          </kbd>
          <span id="recherche-globale-aide" className="sr-only">
            {t.search.shortcut}
          </span>
        </form>
      ) : (
        <span className="flex-1" />
      )}
      {canSeeAlerts ? (
        <AlertsBell
          count={pendingAlerts}
          className="hidden border border-line bg-surface text-ink-muted shadow-[var(--shadow-pill)] hover:text-ink lg:grid"
        />
      ) : null}
    </div>
  );
}
