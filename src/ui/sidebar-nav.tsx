"use client";

import { BellRing, Menu, Plus, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { useAppText } from "@/i18n/app/client";

import { cn } from "./cn";
import { isNavItemActive, visibleNavigation } from "./navigation";
import { sectionAccents, sectionOf } from "./sections";

type SidebarNavProps = {
  brand: ReactNode;
  footer: ReactNode;
  /** Permissions de la personne : seules les entrées autorisées sont affichées. */
  permissions: readonly string[];
  /** Alertes sans accusé de réception : un simple décompte, sans contenu clinique. */
  pendingAlerts: number;
};

/**
 * Barre latérale posée sur le fond « chrome » : bouton « Nouveau suivi » en tête, entrées du
 * quotidien, assistants IA avec leur portrait, puis le cabinet. Sur mobile, elle se replie
 * derrière le bouton menu ; la cloche des alertes reste visible.
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
          {visibleNavigation(granted).map((section, index) => (
            <div key={section.label ?? index} className="mb-4">
              {section.label ? (
                <p className="px-3 pb-1.5 text-[11px] font-bold tracking-[0.08em] text-white/60 uppercase">
                  {t.nav[section.label]}
                </p>
              ) : null}
              <ul className="space-y-0.5">
                {section.items.map(
                  ({ href, label, icon: Icon, assistant, badge }) => {
                    const active = isNavItemActive(href, pathname);
                    const count = badge === "alerts" ? pendingAlerts : 0;
                    // Teinte claire de la rubrique, lisible sur la barre sombre (décor).
                    const glow = sectionAccents[sectionOf(href)].glow;
                    return (
                      <li key={href}>
                        <Link
                          href={href}
                          aria-current={active ? "page" : undefined}
                          // Le menu mobile se referme après chaque navigation.
                          onClick={() => setOpen(false)}
                          className={cn(
                            "group/nav relative flex min-h-9 items-center gap-3 rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-200 focus-visible:outline-mint",
                            active
                              ? "bg-gradient-to-r from-white/14 to-white/4 font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] ring-1 ring-white/10"
                              : "text-white/75 hover:translate-x-0.5 hover:bg-white/6 hover:text-white",
                          )}
                        >
                          {assistant ? (
                            <Image
                              src={`/assistants/${assistant}.webp`}
                              alt=""
                              width={22}
                              height={22}
                              className="size-[22px] shrink-0 rounded-full object-cover ring-1 ring-white/30"
                            />
                          ) : (
                            <span
                              aria-hidden="true"
                              className={cn(
                                "grid size-7 shrink-0 place-items-center rounded-full transition-colors",
                                active
                                  ? "text-[var(--nav-glow)] drop-shadow-[0_0_8px_var(--nav-glow)]"
                                  : "group-hover/nav:text-[var(--nav-glow)]",
                              )}
                              style={{ "--nav-glow": glow } as CSSProperties}
                            >
                              <Icon className="size-[18px]" />
                            </span>
                          )}
                          <span className="min-w-0 flex-1">{t.nav[label]}</span>
                          {count > 0 ? (
                            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-urgent px-1.5 text-[11px] font-bold text-white tabular-nums">
                              {count}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  },
                )}
              </ul>
            </div>
          ))}
        </nav>
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
