"use client";

import { BellRing, Menu, Plus, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";

import { useAppText } from "@/i18n/app/client";

import { cn } from "./cn";
import {
  currentSection,
  isNavItemActive,
  visibleFooter,
  visibleNavigation,
} from "./navigation";

type SidebarNavProps = {
  brand: ReactNode;
  footer: ReactNode;
  /** Permissions de la personne : seules les entrées autorisées sont affichées. */
  permissions: readonly string[];
  /** Alertes sans accusé de réception : un simple décompte, sans contenu clinique. */
  pendingAlerts: number;
};

/**
 * Barre latérale posée sur le fond « chrome » : bouton « Nouveau suivi » en tête, les quatre
 * rubriques (leurs onglets sont en tête de page, ADR 0044), puis le démarrage et l'aide. Sur
 * mobile, elle se replie derrière le bouton menu ; la cloche des alertes reste visible.
 */
export function SidebarNav({
  brand,
  footer,
  permissions,
  pendingAlerts,
}: SidebarNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const t = useAppText().shell;
  const granted = new Set(permissions);
  const canLaunch = granted.has("followups.launch");
  const canSeeAlerts = granted.has("clinical.read");
  const sections = visibleNavigation(granted);
  const current = currentSection(sections, pathname);

  return (
    <aside className="text-white sidebar-glow lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-3 lg:px-5 lg:pt-5 lg:pb-4">
        {brand}
        <div className="flex items-center gap-1 lg:hidden">
          {canSeeAlerts ? (
            <AlertsBell
              count={pendingAlerts}
              onNavigate={setOpen}
              className="text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-mint"
            />
          ) : null}
          <button
            type="button"
            className="grid size-11 place-items-center rounded-full text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-mint"
            aria-expanded={open}
            aria-controls="navigation-principale"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? (
              <X aria-hidden="true" className="size-5" />
            ) : (
              <Menu aria-hidden="true" className="size-5" />
            )}
            <span className="sr-only">{open ? t.closeMenu : t.openMenu}</span>
          </button>
        </div>
      </div>
      <div
        id="navigation-principale"
        className={cn(
          "flex-1 flex-col overflow-y-auto px-3 pb-4 lg:flex",
          open ? "flex" : "hidden",
        )}
      >
        {canLaunch ? (
          <Link
            href="/app/suivis/nouveau"
            onClick={() => setOpen(false)}
            className="mb-5 flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-mint px-4 text-sm font-bold text-night shadow-[0_0_24px_-4px_rgb(140_232_195/0.55)] transition-colors hover:bg-white focus-visible:outline-mint"
          >
            <Plus aria-hidden="true" className="size-4" strokeWidth={2.5} />
            {t.newFollowup}
          </Link>
        ) : null}
        <nav aria-label={t.mainNavigation} className="flex-1">
          <ul className="space-y-1">
            {sections.map((section) => {
              const active = section === current;
              const href = section.tabs[0]?.href ?? "/app";
              const count = section.tabs.some((tab) => tab.badge === "alerts")
                ? pendingAlerts
                : 0;
              const Icon = section.icon;
              return (
                <li key={section.label}>
                  <Link
                    href={href}
                    aria-current={active ? "true" : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "group/nav flex min-h-12 items-center gap-3 rounded-2xl px-3 text-[15px] font-medium transition-all duration-200 focus-visible:outline-mint",
                      active
                        ? "bg-mint/13 font-semibold text-white ring-1 ring-mint/30"
                        : "text-white/75 hover:bg-white/6 hover:text-white",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-xl transition-colors",
                        active
                          ? "bg-mint text-night"
                          : "bg-white/6 group-hover/nav:text-mint",
                      )}
                    >
                      <Icon className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      {t.nav[section.label]}
                    </span>
                    {count > 0 ? (
                      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-urgent px-1.5 text-[11px] font-bold text-white tabular-nums">
                        <span className="sr-only">
                          {t.alertsPending(count)}
                        </span>
                        <span aria-hidden="true">{count}</span>
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <ul className="mt-6 space-y-0.5 border-t border-white/10 pt-3">
          {visibleFooter(granted).map(({ href, label, icon: Icon }) => {
            const active = isNavItemActive(href, pathname);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex min-h-10 items-center gap-3 rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-mint",
                    active
                      ? "bg-white/10 text-white"
                      : "text-white/70 hover:bg-white/6 hover:text-white",
                  )}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  {t.nav[label]}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="pt-3">{footer}</div>
      </div>
    </aside>
  );
}

/** Cloche des alertes : mène à l'écran Alertes, le décompte est dans son nom accessible. */
export function AlertsBell({
  count,
  onNavigate,
  className,
}: {
  count: number;
  onNavigate?: (open: false) => void;
  className?: string;
}) {
  const t = useAppText().shell;
  return (
    <Link
      href="/app/alertes"
      onClick={() => onNavigate?.(false)}
      className={cn(
        "relative grid size-11 shrink-0 place-items-center rounded-full transition-colors",
        className,
      )}
    >
      <BellRing aria-hidden="true" className="size-5" />
      <span className="sr-only">
        {count > 0 ? t.alertsPending(count) : t.alertsNone}
      </span>
      {count > 0 ? (
        <span
          aria-hidden="true"
          className="absolute top-1.5 right-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-urgent px-1 text-[10px] font-bold text-white tabular-nums ring-2 ring-surface"
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}
